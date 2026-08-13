///////////////////////////////
// Constants
///////////////////////////////

const CHALLENGE_ENDPOINT =
    "/auth/challenge";

const DEFAULT_TIMEOUT = 60_000;

///////////////////////////////
// Helpers
///////////////////////////////

function arrayBufferToBase64(buffer) {
    const bytes =
        new Uint8Array(buffer);

    let result = "";

    for (const byte of bytes) {
        result += String.fromCharCode(byte);
    }

    return btoa(result);
}

///////////////////////////////
// Krynet TPM
///////////////////////////////

export class KrynetTPM {
    constructor(auth0Client) {
        this.auth0 = auth0Client;
    }

    ///////////////////////////////
    // Challenge
    ///////////////////////////////

    async fetchChallenge() {
        const response =
            await fetch(
                CHALLENGE_ENDPOINT,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                "Failed to obtain TPM challenge"
            );
        }

        const data =
            await response.json();

        if (
            typeof data.challenge !==
                "string" ||
            !data.challenge
        ) {
            throw new Error(
                "Invalid TPM challenge"
            );
        }

        return data.challenge;
    }

    ///////////////////////////////
    // TPM / WebAuthn assertion
    ///////////////////////////////

    async signChallenge(challenge) {
        if (
            typeof window ===
                "undefined" ||
            !window.PublicKeyCredential
        ) {
            return null;
        }

        const challengeBytes =
            new TextEncoder().encode(
                challenge
            );

        const credential =
            await navigator.credentials.get({
                publicKey: {
                    challenge:
                        challengeBytes,

                    userVerification:
                        "required",

                    timeout:
                        DEFAULT_TIMEOUT
                }
            });

        if (
            !credential ||
            !(
                credential instanceof
                PublicKeyCredential
            )
        ) {
            throw new Error(
                "TPM authentication failed"
            );
        }

        const response =
            credential.response;

        if (
            !(
                response instanceof
                AuthenticatorAssertionResponse
            )
        ) {
            throw new Error(
                "Invalid TPM assertion"
            );
        }

        return response.signature;
    }

    ///////////////////////////////
    // Create proof
    ///////////////////////////////

    async createProof() {
        const challenge =
            await this.fetchChallenge();

        const [
            signature,
            user
        ] = await Promise.all([
            this.signChallenge(
                challenge
            ),

            this.auth0.getUser()
        ]);

        return {
            auth0Sub:
                user?.sub ?? null,

            challenge,

            signature,

            timestamp:
                Date.now(),

            nonce:
                crypto.randomUUID()
        };
    }

    ///////////////////////////////
    // Secure fetch
    ///////////////////////////////

    async secureFetch(
        url,
        options = {}
    ) {
        const proof =
            await this.createProof();

        const headers =
            new Headers(
                options.headers
            );

        headers.set(
            "Content-Type",
            "application/json"
        );

        headers.set(
            "X-Krynet-Sub",
            proof.auth0Sub ?? ""
        );

        headers.set(
            "X-Krynet-Challenge",
            proof.challenge
        );

        headers.set(
            "X-Krynet-Timestamp",
            String(
                proof.timestamp
            )
        );

        headers.set(
            "X-Krynet-Nonce",
            proof.nonce
        );

        headers.set(
            "X-Krynet-Signature",
            proof.signature
                ? arrayBufferToBase64(
                    proof.signature
                )
                : ""
        );

        return fetch(
            url,
            {
                ...options,
                headers,
                credentials:
                    "include"
            }
        );
    }

    ///////////////////////////////
    // Support check
    ///////////////////////////////

    static isSupported() {
        return (
            typeof window !==
                "undefined" &&
            typeof navigator !==
                "undefined" &&
            !!window.PublicKeyCredential &&
            !!navigator.credentials
        );
    }
}
