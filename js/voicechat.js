// js/voicechat.js

///////////////////////////////
// External WASM / global libs
///////////////////////////////

const OpusEncoderWASM = globalThis.OpusEncoderWASM;
const OpusDecoderWASM = globalThis.OpusDecoderWASM;
const RNNoiseWASM = globalThis.RNNoiseWASM;

///////////////////////////////
// Constants
///////////////////////////////

const DEFAULT_FRAME_SIZE = 960;
const DEFAULT_BITRATE = 128000;
const DEFAULT_SAMPLE_RATE = 48000;

const DEFAULT_INACTIVITY_TIMEOUT = 90000;
const DEFAULT_HEARTBEAT_INTERVAL = 30000;

const AES_IV_SIZE = 12;

///////////////////////////////
// Helpers
///////////////////////////////

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let output = "";

    for (const byte of bytes) {
        output += String.fromCharCode(byte);
    }

    return btoa(output);
}

function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

///////////////////////////////
// VoiceChatApex
///////////////////////////////

class VoiceChatApex {
    constructor(serverUrl, sessionId, userId, options = {}) {
        this.serverUrl = String(serverUrl || "").replace(/\/+$/, "");
        this.sessionId = sessionId;
        this.userId = userId;

        this.frameSize =
            options.frameSize ?? DEFAULT_FRAME_SIZE;

        this.bitrate =
            options.bitrate ?? DEFAULT_BITRATE;

        this.sampleRate =
            options.sampleRate ?? DEFAULT_SAMPLE_RATE;

        this.inactivityTimeout =
            options.inactivityTimeout ??
            DEFAULT_INACTIVITY_TIMEOUT;

        this.heartbeatInterval =
            options.heartbeatInterval ??
            DEFAULT_HEARTBEAT_INTERVAL;

        this.serverPublicKey =
            options.serverPublicKey ?? null;

        this.audioContext = null;

        this.inputStream = null;
        this.inputNode = null;
        this.processorNode = null;

        this.opusEncoder = null;
        this.opusDecoder = null;
        this.ai = null;

        this.sessionKey = null;

        this.uploadStream = null;
        this.uploadController = null;

        this.reader = null;

        this.lastActive = Date.now();

        this.listenerHardware = {
            channels: 2,
            sampleRate: this.sampleRate
        };

        this.listenerOrientation = {
            yaw: 0,
            pitch: 0,
            roll: 0
        };

        this.deviceType = "generic";

        this.inactivityTimer = null;
        this.heartbeatTimer = null;
        this.orientationHandler = null;

        this.running = false;
        this.initializing = false;
    }

    ///////////////////////////////
    // INIT
    ///////////////////////////////

    async init() {
        if (this.running || this.initializing) {
            return;
        }

        this.initializing = true;

        try {
            if (
                typeof AudioContext === "undefined" &&
                typeof webkitAudioContext === "undefined"
            ) {
                throw new Error(
                    "Web Audio API is not supported by this browser."
                );
            }

            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "Microphone access is not supported by this browser."
                );
            }

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;

            this.audioContext =
                new AudioContextClass({
                    sampleRate: this.sampleRate,
                    latencyHint: "interactive"
                });

            await this.audioContext.resume();

            await this.detectHardware();
            await this.initKeys();
            await this.loadWASM();
            await this.initMicrophone();
            await this.initHeadTracking();

            this.running = true;

            await this.startTLSStreaming();

            this.startInactivityChecker();
            this.startHeartbeat();

        } catch (error) {
            this.running = false;

            await this.stop();

            throw error;
        } finally {
            this.initializing = false;
        }
    }

    ///////////////////////////////
    // HARDWARE
    ///////////////////////////////

    async detectHardware() {
        if (!this.audioContext) {
            return;
        }

        this.listenerHardware = {
            channels: 2,
            sampleRate: this.audioContext.sampleRate
        };

        if (!navigator.mediaDevices?.enumerateDevices) {
            return;
        }

        try {
            const devices =
                await navigator.mediaDevices.enumerateDevices();

            const output =
                devices.find(
                    device =>
                        device.kind === "audiooutput"
                );

            const label =
                output?.label?.toLowerCase() || "";

            if (label.includes("airpods")) {
                this.deviceType = "airpods";
                return;
            }

            if (
                label.includes("samsung") ||
                label.includes("buds")
            ) {
                this.deviceType = "samsungbuds";
                return;
            }

            this.deviceType = "generic";
        } catch (error) {
            console.warn(
                "Audio device detection failed:",
                error
            );

            this.deviceType = "generic";
        }
    }

    ///////////////////////////////
    // CRYPTO
    ///////////////////////////////

    async initKeys() {
        if (!this.serverPublicKey) {
            throw new Error(
                "Missing server ECDH public key."
            );
        }

        if (!globalThis.crypto?.subtle) {
            throw new Error(
                "Web Crypto API is unavailable."
            );
        }

        const serverKeyBytes =
            base64ToBytes(
                this.serverPublicKey
            );

        const serverPublicKey =
            await crypto.subtle.importKey(
                "raw",
                serverKeyBytes,
                {
                    name: "ECDH",
                    namedCurve: "P-256"
                },
                false,
                []
            );

        const keyPair =
            await crypto.subtle.generateKey(
                {
                    name: "ECDH",
                    namedCurve: "P-256"
                },
                false,
                ["deriveKey"]
            );

        this.sessionKey =
            await crypto.subtle.deriveKey(
                {
                    name: "ECDH",
                    public: serverPublicKey
                },
                keyPair.privateKey,
                {
                    name: "AES-GCM",
                    length: 256
                },
                false,
                [
                    "encrypt",
                    "decrypt"
                ]
            );

        const clientPublicKey =
            await crypto.subtle.exportKey(
                "raw",
                keyPair.publicKey
            );

        const response =
            await fetch(
                `${this.serverUrl}/audio/key`,
                {
                    method: "POST",
                    credentials: "include",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        userId: this.userId,

                        publicKey:
                            arrayBufferToBase64(
                                clientPublicKey
                            )
                    })
                }
            );

        if (!response.ok) {
            const message =
                await response.text()
                    .catch(() => "");

            throw new Error(
                message ||
                "Failed to register client ECDH key."
            );
        }
    }

    ///////////////////////////////
    // WASM
    ///////////////////////////////

    async loadWASM() {
        if (!OpusEncoderWASM) {
            throw new Error(
                "OpusEncoderWASM is not loaded."
            );
        }

        if (!OpusDecoderWASM) {
            throw new Error(
                "OpusDecoderWASM is not loaded."
            );
        }

        if (!RNNoiseWASM) {
            throw new Error(
                "RNNoiseWASM is not loaded."
            );
        }

        this.opusEncoder =
            await OpusEncoderWASM.create({
                sampleRate:
                    this.audioContext.sampleRate,

                channels:
                    this.listenerHardware.channels,

                application: "audio",

                bitrate:
                    this.bitrate
            });

        this.opusDecoder =
            await OpusDecoderWASM.create({
                sampleRate:
                    this.audioContext.sampleRate,

                channels:
                    this.listenerHardware.channels
            });

        this.ai =
            await RNNoiseWASM.create();
    }

    ///////////////////////////////
    // MICROPHONE
    ///////////////////////////////

    async initMicrophone() {
        if (!this.audioContext) {
            throw new Error(
                "Audio context is not initialized."
            );
        }

        this.inputStream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount:
                        this.listenerHardware.channels,

                    sampleRate:
                        this.audioContext.sampleRate,

                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

        this.inputNode =
            this.audioContext.createMediaStreamSource(
                this.inputStream
            );

        const workletUrl =
            URL.createObjectURL(
                new Blob(
                    [
                        VoiceChatApex.voiceProcessorCode()
                    ],
                    {
                        type:
                            "application/javascript"
                    }
                )
            );

        try {
            await this.audioContext.audioWorklet.addModule(
                workletUrl
            );
        } finally {
            URL.revokeObjectURL(workletUrl);
        }

        this.processorNode =
            new AudioWorkletNode(
                this.audioContext,
                "voice-processor",
                {
                    processorOptions: {
                        frameSize:
                            this.frameSize,

                        channels:
                            this.listenerHardware.channels
                    }
                }
            );

        this.inputNode.connect(
            this.processorNode
        );

        this.processorNode.port.onmessage =
            async event => {
                if (!this.running) {
                    return;
                }

                if (
                    event.data?.type !== "frame"
                ) {
                    return;
                }

                const frame =
                    event.data.frame;

                if (!frame) {
                    return;
                }

                this.lastActive = Date.now();

                try {
                    await this.sendFrame(frame);
                } catch (error) {
                    console.error(
                        "Voice frame failed:",
                        error
                    );
                }
            };
    }

    ///////////////////////////////
    // HEAD TRACKING
    ///////////////////////////////

    async initHeadTracking() {
        this.orientationHandler =
            event => {
                this.listenerOrientation = {
                    yaw: Number(event.alpha) || 0,
                    pitch: Number(event.beta) || 0,
                    roll: Number(event.gamma) || 0
                };
            };

        window.addEventListener(
            "deviceorientation",
            this.orientationHandler
        );
    }

    ///////////////////////////////
    // STREAMING
    ///////////////////////////////

    async startTLSStreaming() {
        if (!this.sessionKey) {
            throw new Error(
                "Session encryption key is not initialized."
            );
        }

        let resolveUpload;

        const uploadReady =
            new Promise(resolve => {
                resolveUpload = resolve;
            });

        this.uploadStream =
            new ReadableStream({
                start: controller => {
                    this.uploadController =
                        controller;

                    resolveUpload();
                },

                cancel: () => {
                    this.uploadController = null;
                }
            });

        const uploadPromise =
            fetch(
                `${this.serverUrl}/audio`,
                {
                    method: "POST",

                    body:
                        this.uploadStream,

                    credentials:
                        "include",

                    headers: {
                        "Content-Type":
                            "application/octet-stream",

                        "X-Krynet-Session":
                            this.sessionId,

                        "X-Krynet-User":
                            this.userId
                    }
                }
            );

        await uploadReady;

        uploadPromise.catch(error => {
            if (this.running) {
                console.error(
                    "Audio upload failed:",
                    error
                );
            }
        });

        const response =
            await fetch(
                `${this.serverUrl}/audio/recv`,
                {
                    method: "GET",

                    credentials:
                        "include",

                    headers: {
                        "X-Krynet-Session":
                            this.sessionId,

                        "X-Krynet-User":
                            this.userId
                    }
                }
            );

        if (!response.ok) {
            const message =
                await response.text()
                    .catch(() => "");

            throw new Error(
                message ||
                "Failed to open audio receive stream."
            );
        }

        if (!response.body) {
            throw new Error(
                "Audio receive stream has no body."
            );
        }

        this.reader =
            response.body.getReader();

        this.readIncomingAudio()
            .catch(error => {
                if (this.running) {
                    console.error(
                        "Audio receive loop failed:",
                        error
                    );
                }
            });
    }

    ///////////////////////////////
    // RECEIVE AUDIO
    ///////////////////////////////

    async readIncomingAudio() {
        if (!this.reader) {
            return;
        }

        try {
            while (this.running) {
                const result =
                    await this.reader.read();

                const {
                    done,
                    value
                } = result;

                if (done) {
                    break;
                }

                if (!value) {
                    continue;
                }

                if (
                    value.byteLength <=
                    AES_IV_SIZE
                ) {
                    continue;
                }

                const iv =
                    value.slice(
                        0,
                        AES_IV_SIZE
                    );

                const encrypted =
                    value.slice(
                        AES_IV_SIZE
                    );

                try {
                    const decrypted =
                        await crypto.subtle.decrypt(
                            {
                                name: "AES-GCM",
                                iv
                            },
                            this.sessionKey,
                            encrypted
                        );

                    if (!this.opusDecoder) {
                        continue;
                    }

                    let pcm =
                        this.opusDecoder.decode(
                            new Uint8Array(
                                decrypted
                            )
                        );

                    if (
                        this.ai &&
                        typeof this.ai.process ===
                            "function"
                    ) {
                        pcm =
                            await this.ai.process(
                                pcm
                            );
                    }

                    if (pcm) {
                        this.playAudio(pcm);
                    }
                } catch (error) {
                    console.error(
                        "Audio decode failed:",
                        error
                    );
                }
            }
        } catch (error) {
            if (this.running) {
                console.error(
                    "Audio receive failed:",
                    error
                );
            }
        }
    }

    ///////////////////////////////
    // PLAY AUDIO
    ///////////////////////////////

    playAudio(pcm) {
        if (!this.audioContext) {
            return;
        }

        if (!pcm || !pcm.length) {
            return;
        }

        const channels =
            this.listenerHardware.channels;

        const samplesPerChannel =
            Math.floor(
                pcm.length / channels
            );

        if (samplesPerChannel <= 0) {
            return;
        }

        const buffer =
            this.audioContext.createBuffer(
                channels,
                samplesPerChannel,
                this.audioContext.sampleRate
            );

        for (
            let channel = 0;
            channel < channels;
            channel++
        ) {
            const output =
                buffer.getChannelData(
                    channel
                );

            for (
                let i = 0;
                i < samplesPerChannel;
                i++
            ) {
                const index =
                    i * channels +
                    channel;

                output[i] =
                    Number(pcm[index]) || 0;
            }
        }

        const source =
            this.audioContext.createBufferSource();

        source.buffer = buffer;

        const panner =
            new PannerNode(
                this.audioContext,
                {
                    panningModel: "HRTF",
                    distanceModel: "inverse",

                    positionX: 0,
                    positionY: 0,
                    positionZ: -1
                }
            );

        this.configurePanner(panner);

        source
            .connect(panner)
            .connect(
                this.audioContext.destination
            );

        source.onended = () => {
            try {
                source.disconnect();
                panner.disconnect();
            } catch {
                // Already disconnected.
            }
        };

        source.start();
    }

    ///////////////////////////////
    // SPATIAL AUDIO
    ///////////////////////////////

    configurePanner(panner) {
        if (!panner) {
            return;
        }

        const angle =
            -this.listenerOrientation.yaw *
            Math.PI /
            180;

        panner.positionX.value =
            Math.sin(angle);

        panner.positionY.value = 0;

        panner.positionZ.value =
            Math.cos(angle);

        if (
            this.deviceType ===
            "airpods"
        ) {
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 360;
            panner.coneOuterGain = 1;
        }

        if (
            this.deviceType ===
            "samsungbuds"
        ) {
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 270;
            panner.coneOuterGain = 0.5;
        }
    }

    ///////////////////////////////
    // SEND FRAME
    ///////////////////////////////

    async sendFrame(framePCM) {
        if (!this.running) {
            return;
        }

        if (
            !this.ai ||
            !this.opusEncoder ||
            !this.sessionKey ||
            !this.uploadController
        ) {
            return;
        }

        if (!framePCM?.length) {
            return;
        }

        let enhanced = framePCM;

        if (
            typeof this.ai.process ===
            "function"
        ) {
            enhanced =
                await this.ai.process(
                    framePCM
                );
        }

        const encoded =
            this.opusEncoder.encode(
                enhanced,
                this.bitrate
            );

        if (!encoded) {
            return;
        }

        const iv =
            crypto.getRandomValues(
                new Uint8Array(
                    AES_IV_SIZE
                )
            );

        const encrypted =
            await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv
                },
                this.sessionKey,
                encoded
            );

        const encryptedBytes =
            new Uint8Array(
                encrypted
            );

        const payload =
            new Uint8Array(
                AES_IV_SIZE +
                encryptedBytes.byteLength
            );

        payload.set(
            iv,
            0
        );

        payload.set(
            encryptedBytes,
            AES_IV_SIZE
        );

        if (
            this.uploadController
        ) {
            try {
                this.uploadController.enqueue(
                    payload
                );
            } catch (error) {
                console.error(
                    "Failed to enqueue voice frame:",
                    error
                );
            }
        }
    }

    ///////////////////////////////
    // INACTIVITY
    ///////////////////////////////

    startInactivityChecker() {
        this.clearInactivityTimer();

        this.inactivityTimer =
            window.setInterval(() => {
                if (!this.running) {
                    return;
                }

                const inactiveFor =
                    Date.now() -
                    this.lastActive;

                if (
                    inactiveFor >
                    this.inactivityTimeout
                ) {
                    this.stop().catch(
                        error => {
                            console.error(
                                "Voice inactivity cleanup failed:",
                                error
                            );
                        }
                    );
                }
            }, 1000);
    }

    ///////////////////////////////
    // HEARTBEAT
    ///////////////////////////////

    startHeartbeat() {
        this.clearHeartbeatTimer();

        const sendHeartbeat =
            () => {
                if (!this.running) {
                    return;
                }

                fetch(
                    `${this.serverUrl}/heartbeat`,
                    {
                        method: "POST",

                        credentials:
                            "include",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                sessionId:
                                    this.sessionId,

                                userId:
                                    this.userId
                            })
                    }
                ).catch(() => {});
            };

        sendHeartbeat();

        this.heartbeatTimer =
            window.setInterval(
                sendHeartbeat,
                this.heartbeatInterval
            );
    }

    ///////////////////////////////
    // CLEANUP
    ///////////////////////////////

    async stop() {
        this.running = false;

        this.clearInactivityTimer();
        this.clearHeartbeatTimer();

        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch {
                // Reader may already be closed.
            }
        }

        this.reader = null;

        if (this.uploadController) {
            try {
                this.uploadController.close();
            } catch {
                // Stream may already be closed.
            }
        }

        this.uploadController = null;
        this.uploadStream = null;

        this.cleanup();
    }

    cleanup() {
        if (this.processorNode) {
            try {
                this.processorNode.port.close();
            } catch {}

            try {
                this.processorNode.disconnect();
            } catch {}

            this.processorNode = null;
        }

        if (this.inputNode) {
            try {
                this.inputNode.disconnect();
            } catch {}

            this.inputNode = null;
        }

        if (this.inputStream) {
            for (
                const track of
                this.inputStream.getTracks()
            ) {
                try {
                    track.stop();
                } catch {}
            }

            this.inputStream = null;
        }

        if (this.orientationHandler) {
            window.removeEventListener(
                "deviceorientation",
                this.orientationHandler
            );

            this.orientationHandler = null;
        }

        this.opusEncoder = null;
        this.opusDecoder = null;
        this.ai = null;
        this.sessionKey = null;

        if (this.audioContext) {
            const context =
                this.audioContext;

            this.audioContext = null;

            context.close().catch(() => {});
        }
    }

    ///////////////////////////////
    // TIMERS
    ///////////////////////////////

    clearInactivityTimer() {
        if (
            this.inactivityTimer !== null
        ) {
            clearInterval(
                this.inactivityTimer
            );

            this.inactivityTimer = null;
        }
    }

    clearHeartbeatTimer() {
        if (
            this.heartbeatTimer !== null
        ) {
            clearInterval(
                this.heartbeatTimer
            );

            this.heartbeatTimer = null;
        }
    }

    ///////////////////////////////
    // WORKLET
    ///////////////////////////////

    static voiceProcessorCode() {
        return `
class VoiceProcessor extends AudioWorkletProcessor {

    constructor(options) {
        super();

        const processorOptions =
            options.processorOptions || {};

        this.frameSize =
            processorOptions.frameSize || 960;

        this.channels =
            processorOptions.channels || 2;

        this.buffer =
            new Float32Array(
                this.frameSize
            );

        this.offset = 0;
    }

    process(inputs) {
        const input =
            inputs[0]?.[0];

        if (!input) {
            return true;
        }

        let offset = 0;

        while (
            offset < input.length
        ) {
            const remaining =
                this.buffer.length -
                this.offset;

            const available =
                input.length -
                offset;

            const count =
                Math.min(
                    remaining,
                    available
                );

            this.buffer.set(
                input.subarray(
                    offset,
                    offset + count
                ),
                this.offset
            );

            this.offset += count;
            offset += count;

            if (
                this.offset >=
                this.buffer.length
            ) {
                const frame =
                    new Float32Array(
                        this.buffer
                    );

                this.port.postMessage(
                    {
                        type: "frame",
                        frame: frame
                    },
                    [
                        frame.buffer
                    ]
                );

                this.offset = 0;
            }
        }

        return true;
    }
}

registerProcessor(
    "voice-processor",
    VoiceProcessor
);
`;
    }
}

///////////////////////////////
// Browser global
///////////////////////////////

window.VoiceChatApex = VoiceChatApex;
