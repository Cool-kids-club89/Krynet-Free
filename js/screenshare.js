///////////////////////////////
// Helpers
///////////////////////////////

function clamp(value, min, max) {
    return Math.min(
        Math.max(value, min),
        max
    );
}

function createPacket(type, data) {
    const packet = new Uint8Array(
        1 + data.byteLength
    );

    packet[0] = type;

    packet.set(
        new Uint8Array(data),
        1
    );

    return packet.buffer;
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (!blob) {
                    reject(
                        new Error(
                            "Failed to encode video frame"
                        )
                    );

                    return;
                }

                resolve(blob);
            },
            "image/webp",
            quality
        );
    });
}

///////////////////////////////
// Constants
///////////////////////////////

const DEFAULT_MAX_FPS = 60;
const MIN_FPS = 5;

const FRAME_TYPE = 0;
const AUDIO_TYPE = 1;

///////////////////////////////
// WebSocket Transport
///////////////////////////////

function createWebSocketTransport(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);

        socket.binaryType = "arraybuffer";

        socket.onopen = () => {
            resolve({
                async write(data) {
                    if (
                        socket.readyState !==
                        WebSocket.OPEN
                    ) {
                        throw new Error(
                            "WebSocket is not open"
                        );
                    }

                    socket.send(data);
                },

                close() {
                    if (
                        socket.readyState ===
                        WebSocket.OPEN ||
                        socket.readyState ===
                        WebSocket.CONNECTING
                    ) {
                        socket.close();
                    }
                },

                isOpen() {
                    return (
                        socket.readyState ===
                        WebSocket.OPEN
                    );
                }
            });
        };

        socket.onerror = () => {
            reject(
                new Error(
                    "WebSocket connection failed"
                )
            );
        };
    });
}

///////////////////////////////
// WebTransport
///////////////////////////////

async function createWebTransport(url) {
    if (!("WebTransport" in window)) {
        throw new Error(
            "WebTransport is not supported"
        );
    }

    const transport =
        new WebTransport(url);

    await transport.ready;

    const writer =
        transport.datagrams.writable
            .getWriter();

    let closed = false;

    return {
        async write(data) {
            if (closed) {
                throw new Error(
                    "WebTransport is closed"
                );
            }

            await writer.write(
                new Uint8Array(data)
            );
        },

        close() {
            if (closed) {
                return;
            }

            closed = true;

            writer.close().catch(() => {});
            transport.close();
        },

        isOpen() {
            return !closed;
        }
    };
}

///////////////////////////////
// Transport Selection
///////////////////////////////

async function createTransport(
    wsUrl,
    wtUrl
) {
    if ("WebTransport" in window) {
        try {
            const transport =
                await createWebTransport(
                    wtUrl
                );

            return {
                writer: transport,
                raw: null
            };
        } catch {
            // Fall back to WebSocket.
        }
    }

    const transport =
        await createWebSocketTransport(
            wsUrl
        );

    return {
        writer: transport,
        raw: null
    };
}

///////////////////////////////
// Main
///////////////////////////////

async function startMonitorAdaptiveScreenshare(
    wsUrl,
    wtUrl,
    options = {}
) {
    const captureAudio =
        options.captureAudio ?? true;

    const videoQuality = clamp(
        options.videoQuality ?? 0.9,
        0.1,
        1
    );

    const maxFPS = clamp(
        Math.floor(
            options.maxFPS ??
            DEFAULT_MAX_FPS
        ),
        MIN_FPS,
        DEFAULT_MAX_FPS
    );

    const useSpatialAudio =
        options.useSpatialAudio ?? false;

    let stream = null;
    let video = null;
    let canvas = null;
    let ctx = null;

    let audioContext = null;
    let audioProcessor = null;

    let transport = null;
    let rawTransport = null;

    let frameTimer = null;
    let stopped = false;
    let sendingFrame = false;

    let fps = maxFPS;

    try {
        ///////////////////////////////
        // 1. Capture screen
        ///////////////////////////////

        stream =
            await navigator.mediaDevices
                .getDisplayMedia({
                    video: {
                        frameRate: {
                            ideal: maxFPS,
                            max: maxFPS
                        }
                    },

                    audio: captureAudio
                });

        const videoTrack =
            stream.getVideoTracks()[0];

        if (!videoTrack) {
            throw new Error(
                "Screen capture returned no video track"
            );
        }

        ///////////////////////////////
        // 2. Capture dimensions
        ///////////////////////////////

        const settings =
            videoTrack.getSettings();

        const width =
            settings.width ??
            window.screen.width;

        const height =
            settings.height ??
            window.screen.height;

        ///////////////////////////////
        // 3. Video element
        ///////////////////////////////

        video =
            document.createElement("video");

        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;

        await video.play();

        ///////////////////////////////
        // 4. Canvas
        ///////////////////////////////

        canvas =
            document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        ctx =
            canvas.getContext("2d");

        if (!ctx) {
            throw new Error(
                "2D canvas is not available"
            );
        }

        ///////////////////////////////
        // 5. Transport
        ///////////////////////////////

        const connection =
            await createTransport(
                wsUrl,
                wtUrl
            );

        transport =
            connection.writer;

        rawTransport =
            connection.raw;

        ///////////////////////////////
        // 6. Frame loop
        ///////////////////////////////

        let lastFrame =
            performance.now();

        const sendFrame =
            async () => {
                if (
                    stopped ||
                    !transport ||
                    !canvas ||
                    !ctx ||
                    !video
                ) {
                    return;
                }

                /*
                 * Don't allow multiple encodes/writes
                 * to run simultaneously.
                 */
                if (sendingFrame) {
                    scheduleNextFrame();
                    return;
                }

                if (!transport.isOpen()) {
                    return;
                }

                const now =
                    performance.now();

                const interval =
                    1000 / fps;

                if (
                    now - lastFrame <
                    interval
                ) {
                    scheduleNextFrame();
                    return;
                }

                sendingFrame = true;

                try {
                    ctx.drawImage(
                        video,
                        0,
                        0,
                        width,
                        height
                    );

                    const blob =
                        await canvasToBlob(
                            canvas,
                            videoQuality
                        );

                    const buffer =
                        await blob.arrayBuffer();

                    await transport.write(
                        createPacket(
                            FRAME_TYPE,
                            buffer
                        )
                    );

                    /*
                     * Successful delivery:
                     * cautiously increase FPS.
                     */
                    fps = Math.min(
                        maxFPS,
                        fps + 1
                    );

                    lastFrame =
                        performance.now();

                } catch {
                    /*
                     * Transport or encoding pressure.
                     * Back off rather than building
                     * an unbounded queue.
                     */
                    fps = Math.max(
                        MIN_FPS,
                        Math.floor(
                            fps * 0.8
                        )
                    );

                } finally {
                    sendingFrame = false;
                }

                scheduleNextFrame();
            };

        function scheduleNextFrame() {
            if (stopped) {
                return;
            }

            if (frameTimer !== null) {
                window.clearTimeout(
                    frameTimer
                );
            }

            frameTimer =
                window.setTimeout(
                    () => {
                        frameTimer = null;
                        void sendFrame();
                    },
                    1000 / fps
                );
        }

        scheduleNextFrame();

        ///////////////////////////////
        // 7. Audio
        ///////////////////////////////

        if (
            captureAudio &&
            stream.getAudioTracks().length > 0
        ) {
            audioContext =
                new AudioContext({
                    sampleRate: 48000
                });

            const source =
                audioContext
                    .createMediaStreamSource(
                        stream
                    );

            if (useSpatialAudio) {
                const panner =
                    audioContext
                        .createPanner();

                panner.panningModel =
                    "HRTF";

                source
                    .connect(panner)
                    .connect(
                        audioContext.destination
                    );
            }

            /*
             * ScriptProcessorNode is deprecated,
             * but remains broadly compatible.
             */
            audioProcessor =
                audioContext
                    .createScriptProcessor(
                        2048,
                        1,
                        1
                    );

            source.connect(
                audioProcessor
            );

            audioProcessor.connect(
                audioContext.destination
            );

            audioProcessor.onaudioprocess =
                event => {
                    if (
                        stopped ||
                        !transport ||
                        !transport.isOpen()
                    ) {
                        return;
                    }

                    const input =
                        event
                            .inputBuffer
                            .getChannelData(0);

                    const samples =
                        new Int16Array(
                            input.length
                        );

                    for (
                        let i = 0;
                        i < input.length;
                        i++
                    ) {
                        const sample =
                            clamp(
                                input[i],
                                -1,
                                1
                            );

                        samples[i] =
                            sample * 0x7fff;
                    }

                    const packet =
                        createPacket(
                            AUDIO_TYPE,
                            samples.buffer
                        );

                    void transport
                        .write(packet)
                        .catch(() => {});
                };
        }

        ///////////////////////////////
        // 8. Cleanup
        ///////////////////////////////

        const stop = () => {
            if (stopped) {
                return;
            }

            stopped = true;

            if (frameTimer !== null) {
                window.clearTimeout(
                    frameTimer
                );

                frameTimer = null;
            }

            audioProcessor?.disconnect();
            audioProcessor = null;

            if (audioContext) {
                void audioContext
                    .close()
                    .catch(() => {});

                audioContext = null;
            }

            if (video) {
                video.pause();
                video.srcObject = null;
                video = null;
            }

            if (stream) {
                for (
                    const track of
                    stream.getTracks()
                ) {
                    track.stop();
                }

                stream = null;
            }

            transport?.close();
            transport = null;

            if (
                rawTransport instanceof
                WebSocket
            ) {
                if (
                    rawTransport.readyState ===
                    WebSocket.OPEN ||
                    rawTransport.readyState ===
                    WebSocket.CONNECTING
                ) {
                    rawTransport.close();
                }
            }

            rawTransport = null;
            canvas = null;
            ctx = null;

            console.log(
                "[Krynet] Monitor screenshare stopped"
            );
        };

        videoTrack.addEventListener(
            "ended",
            stop,
            { once: true }
        );

        return {
            stream,
            transport: rawTransport,
            stop
        };

    } catch (error) {
        /*
         * Initialization failed halfway through.
         */
        stopped = true;

        if (frameTimer !== null) {
            window.clearTimeout(
                frameTimer
            );
        }

        audioProcessor?.disconnect();

        if (audioContext) {
            await audioContext
                .close()
                .catch(() => {});
        }

        if (video) {
            video.pause();
            video.srcObject = null;
        }

        if (stream) {
            for (
                const track of
                stream.getTracks()
            ) {
                track.stop();
            }
        }

        transport?.close();

        throw error;
    }
}

///////////////////////////////
// Public API
///////////////////////////////

window.startMonitorAdaptiveScreenshare =
    startMonitorAdaptiveScreenshare;
