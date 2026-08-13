(() => {
    "use strict";

    ///////////////////////////////
    // Frontend detection
    ///////////////////////////////

    const host = location.hostname;

    const isSupportedFrontend =
        /(?:youtube\.com|youtube-nocookie\.com)$/i.test(host) ||
        /(?:invidio\.us|invidious)/i.test(host) ||
        /piped/i.test(host) ||
        location.pathname.startsWith("/embed/");

    if (!isSupportedFrontend) {
        return;
    }

    ///////////////////////////////
    // Ad response fields
    ///////////////////////////////

    const AD_FIELDS = {
        adPlacements: [],
        playerAds: [],
        adBreakHeartbeatParams: null,
        adSlots: []
    };

    ///////////////////////////////
    // Helpers
    ///////////////////////////////

    function isObject(value) {
        return (
            typeof value === "object" &&
            value !== null
        );
    }

    function rewriteAds(
        value,
        seen = new WeakSet()
    ) {
        if (!isObject(value)) {
            return;
        }

        if (seen.has(value)) {
            return;
        }

        seen.add(value);

        for (const key of Object.keys(value)) {
            if (key in AD_FIELDS) {
                value[key] = AD_FIELDS[key];
                continue;
            }

            const child = value[key];

            if (isObject(child)) {
                rewriteAds(child, seen);
            }
        }
    }

    function isJsonResponse(response) {
        const contentType =
            response.headers.get("content-type") || "";

        return contentType
            .toLowerCase()
            .includes("application/json");
    }

    ///////////////////////////////
    // Fetch interception
    ///////////////////////////////

    const nativeFetch =
        window.fetch.bind(window);

    window.fetch = async (
        input,
        init
    ) => {
        const response =
            await nativeFetch(
                input,
                init
            );

        if (!isJsonResponse(response)) {
            return response;
        }

        try {
            const data =
                await response
                    .clone()
                    .json();

            rewriteAds(data);

            const headers =
                new Headers(
                    response.headers
                );

            return new Response(
                JSON.stringify(data),
                {
                    status:
                        response.status,

                    statusText:
                        response.statusText,

                    headers
                }
            );
        } catch {
            return response;
        }
    };

    ///////////////////////////////
    // JSON.parse interception
    ///////////////////////////////

    const nativeJSONParse =
        JSON.parse.bind(JSON);

    JSON.parse = (
        text,
        reviver
    ) => {
        const parsed =
            nativeJSONParse(
                text,
                reviver
            );

        rewriteAds(parsed);

        return parsed;
    };

    ///////////////////////////////
    // Tracking parameter cleanup
    ///////////////////////////////

    const TRACKING_PARAMS =
        new Set([
            "si",
            "feature",
            "pp"
        ]);

    function cleanCurrentURL() {
        const url =
            new URL(location.href);

        let changed = false;

        for (
            const key of [
                ...url.searchParams.keys()
            ]
        ) {
            if (
                key
                    .toLowerCase()
                    .startsWith("utm_") ||
                TRACKING_PARAMS.has(key)
            ) {
                url.searchParams.delete(key);
                changed = true;
            }
        }

        if (!changed) {
            return;
        }

        history.replaceState(
            history.state,
            "",
            url.toString()
        );
    }

    cleanCurrentURL();

    ///////////////////////////////
    // Cosmetic filters
    ///////////////////////////////

    const COSMETIC_SELECTORS = [
        ".ytp-ad-overlay-container",
        ".ytp-ad-module",
        ".ytd-display-ad-renderer",
        ".ytd-promoted-video-renderer",
        ".video-ads",
        ".ytp-ad-player-overlay",
        ".ytp-ad-text-overlay",
        ".ytp-ad-overlay-slot",
        "[class*='promoted']",
        "[class*='ad-container']",
        ".sponsor",
        ".promoted"
    ];

    function installStyle(
        id,
        selectors
    ) {
        if (
            document.getElementById(id)
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id = id;

        style.textContent =
            selectors
                .map(selector => {
                    return `${selector}{display:none!important}`;
                })
                .join("\n");

        document.head.appendChild(style);
    }

    installStyle(
        "krynet-ad-filters",
        COSMETIC_SELECTORS
    );

    ///////////////////////////////
    // Ad state detection
    ///////////////////////////////

    function isVideoShowingAd() {
        return Boolean(
            document.querySelector(
                ".ad-showing"
            ) ||
            document.querySelector(
                ".ytp-ad-player-overlay"
            ) ||
            document.querySelector(
                ".video-ads"
            )
        );
    }

    function findVideo() {
        return document.querySelector(
            "video"
        );
    }

    ///////////////////////////////
    // Skip button
    ///////////////////////////////

    function clickSkipButton() {
        const button =
            document.querySelector(
                [
                    ".ytp-ad-skip-button",
                    ".ytp-skip-ad-button",
                    ".ytp-ad-skip-button-modern"
                ].join(",")
            );

        if (!button) {
            return false;
        }

        if (button.disabled) {
            return false;
        }

        button.click();

        return true;
    }

    ///////////////////////////////
    // Auto skip
    ///////////////////////////////

    function skipCurrentAd() {
        const video =
            findVideo();

        if (!video) {
            return;
        }

        if (clickSkipButton()) {
            return;
        }

        if (!isVideoShowingAd()) {
            return;
        }

        if (
            Number.isFinite(
                video.duration
            ) &&
            video.duration > 0
        ) {
            try {
                video.currentTime =
                    video.duration;
            } catch {
                // Video may have changed underneath us.
            }
        }
    }

    ///////////////////////////////
    // Mutation observer
    ///////////////////////////////

    let skipScheduled = false;

    function scheduleSkip() {
        if (skipScheduled) {
            return;
        }

        skipScheduled = true;

        queueMicrotask(() => {
            skipScheduled = false;
            skipCurrentAd();
        });
    }

    const observer =
        new MutationObserver(
            scheduleSkip
        );

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "class",
                "style"
            ]
        }
    );

    ///////////////////////////////
    // Video events
    ///////////////////////////////

    document.addEventListener(
        "play",
        scheduleSkip,
        true
    );

    document.addEventListener(
        "loadedmetadata",
        scheduleSkip,
        true
    );

    ///////////////////////////////
    // Embedded players
    ///////////////////////////////

    function patchEmbed(iframe) {
        const src =
            iframe.src;

        if (!src) {
            return;
        }

        try {
            const url =
                new URL(src);

            const iframeHost =
                url.hostname.toLowerCase();

            const supported =
                iframeHost.includes(
                    "youtube"
                ) ||
                iframeHost.includes(
                    "piped"
                ) ||
                iframeHost.includes(
                    "invidious"
                );

            if (!supported) {
                return;
            }

            let changed = false;

            const params = {
                autoplay: "1",
                modestbranding: "1",
                rel: "0"
            };

            for (
                const [key, value]
                of Object.entries(params)
            ) {
                if (
                    url.searchParams.get(
                        key
                    ) !== value
                ) {
                    url.searchParams.set(
                        key,
                        value
                    );

                    changed = true;
                }
            }

            if (changed) {
                iframe.src =
                    url.toString();
            }
        } catch {
            // Invalid iframe URL.
        }
    }

    function scanEmbeds(
        root = document
    ) {
        for (
            const iframe of
            root.querySelectorAll("iframe")
        ) {
            patchEmbed(iframe);
        }
    }

    scanEmbeds();

    const embedObserver =
        new MutationObserver(() => {
            scanEmbeds();
        });

    embedObserver.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    ///////////////////////////////
    // Initial skip
    ///////////////////////////////

    skipCurrentAd();

    ///////////////////////////////
    // Periodic fallback
    ///////////////////////////////

    const skipTimer =
        window.setInterval(
            skipCurrentAd,
            500
        );

    ///////////////////////////////
    // Public cleanup
    ///////////////////////////////

    function destroy() {
        observer.disconnect();
        embedObserver.disconnect();

        document.removeEventListener(
            "play",
            scheduleSkip,
            true
        );

        document.removeEventListener(
            "loadedmetadata",
            scheduleSkip,
            true
        );

        window.clearInterval(
            skipTimer
        );

        window.fetch =
            nativeFetch;

        JSON.parse =
            nativeJSONParse;

        const style =
            document.getElementById(
                "krynet-ad-filters"
            );

        style?.remove();

        delete window.KrynetAdBlock;
    }

    ///////////////////////////////
    // Global API
    ///////////////////////////////

    window.KrynetAdBlock = {
        destroy,
        skip: skipCurrentAd
    };

    console.log(
        "[Krynet] Ad handling initialized"
    );
})();
