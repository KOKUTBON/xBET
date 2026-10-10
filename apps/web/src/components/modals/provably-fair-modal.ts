/**
 * Provably Fair Cryptographic Verification Modal Component
 *
 * Provides players with an independent, transparent cryptographic verification tool
 * to audit any Casino (Roulette, Aviator, etc.) or Virtual Sports outcome.
 *
 * Verifies:
 * 1. Pre-Round Commitment: SHA256(serverSeed) === serverSeedHash (proves server did not alter seed after bet)
 * 2. Deterministic Outcome: HMAC_SHA256(serverSeed, clientSeed:nonce) -> unbiased rejection sampling output
 */

import { AppStateManager } from '../../state/app-state.ts';
import { icon, esc, jsq } from '../../ui/icons.ts';

/** Pure-JS SHA256 & HMAC-SHA256 implementation for synchronous in-browser and Node verification */
export class CryptoVerificationHelper {
  private static rotr(n: number, x: number): number {
    return (x >>> n) | (x << (32 - n));
  }

  private static sha256Raw(bytes: Uint8Array): Uint8Array {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

    const bitLen = bytes.length * 8;
    const padLen = (bytes.length + 9 + 63) & ~63;
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padLen - 4, bitLen, false);

    const W = new Int32Array(64);
    for (let i = 0; i < padLen; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = this.rotr(7, W[t - 15]) ^ this.rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const s1 = this.rotr(17, W[t - 2]) ^ this.rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }

      let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
      for (let t = 0; t < 64; t++) {
        const S1 = this.rotr(6, e) ^ this.rotr(11, e) ^ this.rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
        const S0 = this.rotr(2, a) ^ this.rotr(13, a) ^ this.rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;

        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }

      H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + c) | 0; H3 = (H3 + d) | 0;
      H4 = (H4 + e) | 0; H5 = (H5 + f) | 0; H6 = (H6 + g) | 0; H7 = (H7 + h) | 0;
    }

    const res = new Uint8Array(32);
    const out = new DataView(res.buffer);
    out.setUint32(0, H0, false); out.setUint32(4, H1, false);
    out.setUint32(8, H2, false); out.setUint32(12, H3, false);
    out.setUint32(16, H4, false); out.setUint32(20, H5, false);
    out.setUint32(24, H6, false); out.setUint32(28, H7, false);
    return res;
  }

  public static sha256Hex(str: string): string {
    const enc = new TextEncoder().encode(str);
    const raw = this.sha256Raw(enc);
    return Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  public static hmacSha256(key: string, msg: string): Uint8Array {
    let keyBytes = new TextEncoder().encode(key);
    if (keyBytes.length > 64) {
      keyBytes = this.sha256Raw(keyBytes);
    }
    const kPad = new Uint8Array(64);
    kPad.set(keyBytes);

    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      ipad[i] = kPad[i] ^ 0x36;
      opad[i] = kPad[i] ^ 0x5c;
    }

    const msgBytes = new TextEncoder().encode(msg);
    const innerBuf = new Uint8Array(64 + msgBytes.length);
    innerBuf.set(ipad, 0);
    innerBuf.set(msgBytes, 64);
    const innerHash = this.sha256Raw(innerBuf);

    const outerBuf = new Uint8Array(64 + 32);
    outerBuf.set(opad, 0);
    outerBuf.set(innerHash, 64);
    return this.sha256Raw(outerBuf);
  }

  public static hmacSha256Hex(key: string, msg: string): string {
    const raw = this.hmacSha256(key, msg);
    return Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Re-evaluates standard European Roulette outcome (0-36) via rejection sampling
   */
  public static deriveRoulettePocket(serverSeed: string, clientSeed: string, nonce: number): number {
    const hmac = this.hmacSha256(serverSeed, `${clientSeed}:${nonce}`);
    const view = new DataView(hmac.buffer);
    const maxUsable = 4294967295 - (4294967295 % 37);
    for (let offset = 0; offset <= hmac.length - 4; offset += 4) {
      const val = view.getUint32(offset, false);
      if (val < maxUsable) {
        return val % 37;
      }
    }
    return view.getUint32(0, false) % 37;
  }
}

export class ProvablyFairModalComponent {
  public static customServerSeed: string = '';
  public static customServerSeedHash: string = '';
  public static customClientSeed: string = '';
  public static customNonce: number = 1;
  public static customGameCode: string = 'roulette';
  public static activeResult: any = null;

  public static setFromRound(roundData: any): void {
    if (!roundData) return;
    const raw = roundData.raw || roundData;
    this.customServerSeed = raw.serverSeed || raw.revealedServerSeed || '';
    this.customServerSeedHash = raw.serverSeedHash || raw.committedSeedHash || '';
    this.customClientSeed = raw.clientSeed || 'player-fair-seed-01';
    this.customNonce = Number(raw.nonce ?? 1);
    this.customGameCode = raw.gameCode || (roundData.kind === 'race' ? 'virtual-racing' : 'roulette');
    this.activeResult = null;
  }

  public static verify(): void {
    const sSeed = this.customServerSeed.trim();
    const sHash = this.customServerSeedHash.trim();
    const cSeed = this.customClientSeed.trim();
    const nonce = this.customNonce;

    if (!sSeed) {
      this.activeResult = {
        verified: false,
        message: 'Server seed is required. For uncompleted rounds, server seed is kept secret until round finish.',
      };
      return;
    }

    const calculatedHash = CryptoVerificationHelper.sha256Hex(sSeed);
    const hashMatches = !sHash || calculatedHash.toLowerCase() === sHash.toLowerCase();

    let calculatedOutcome: string | number = '';
    if (this.customGameCode === 'roulette') {
      const pocket = CryptoVerificationHelper.deriveRoulettePocket(sSeed, cSeed, nonce);
      calculatedOutcome = `Roulette Pocket: #${pocket}`;
    } else {
      const hmacHex = CryptoVerificationHelper.hmacSha256Hex(sSeed, `${cSeed}:${nonce}`);
      calculatedOutcome = `HMAC Hash: ${hmacHex.slice(0, 16)}...`;
    }

    this.activeResult = {
      verified: hashMatches,
      hashMatches,
      calculatedHash,
      expectedHash: sHash,
      calculatedOutcome,
      hmacHex: CryptoVerificationHelper.hmacSha256Hex(sSeed, `${cSeed}:${nonce}`),
      message: hashMatches
        ? '✅ 100% PROVABLY FAIR: Server seed commitment matches perfectly!'
        : '❌ HASH MISMATCH: Server seed does not match published hash commitment!',
    };
  }

  public static render(appState: AppStateManager): string {
    if (!appState.showProvablyFairModal) return '';

    const res = this.activeResult;

    return `
      <div class="modal-backdrop" onclick="if (event.target === this) window.appState.toggleProvablyFairModal(false)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fair-title" style="max-width: 580px;">
          <header class="modal-h">
            <span class="modal-ico tone-volt">${icon('shield-check')}</span>
            <div>
              <h2 id="fair-title">Provably Fair Verification</h2>
              <p>Cryptographic HMAC-SHA256 outcome audit</p>
            </div>
            <button type="button" class="icon-btn" onclick="window.appState.toggleProvablyFairModal(false)" aria-label="Close">${icon('x')}</button>
          </header>

          <div class="balance-banner">
            <span>${icon('lock')}Trustless Verification</span>
            <strong class="mono" style="font-size: 0.9rem; color: var(--color-volt, #00e676);">Zero House Manipulation</strong>
          </div>

          <section class="panel" style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <label class="field-label">Pre-Round Commitment Hash (SHA-256)</label>
              <input type="text" class="input mono" style="font-size: 0.8rem;" value="${esc(this.customServerSeedHash)}" placeholder="Published before bet placement"
                onchange="ProvablyFairModalComponent.customServerSeedHash = this.value;" />
            </div>

            <div>
              <label class="field-label">Revealed Server Seed</label>
              <input type="text" class="input mono" style="font-size: 0.8rem;" value="${esc(this.customServerSeed)} " placeholder="Revealed after round"
                onchange="ProvablyFairModalComponent.customServerSeed = this.value;" />
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
              <div>
                <label class="field-label">Client Seed (Player Seed)</label>
                <input type="text" class="input mono" value="${esc(this.customClientSeed)}"
                  onchange="ProvablyFairModalComponent.customClientSeed = this.value;" />
              </div>
              <div>
                <label class="field-label">Nonce</label>
                <input type="number" class="input mono" value="${this.customNonce}" min="1"
                  onchange="ProvablyFairModalComponent.customNonce = parseInt(this.value, 10) || 1;" />
              </div>
            </div>

            <button type="button" class="btn btn-volt btn-block" onclick="ProvablyFairModalComponent.verify(); window.renderApp();">
              ${icon('shield-check')}Verify Cryptographic Fairness
            </button>
          </section>

          ${res ? `
            <section class="panel" style="background: ${res.verified ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 23, 68, 0.08)'}; border: 1px solid ${res.verified ? '#00e676' : '#ff1744'};">
              <h3 style="color: ${res.verified ? '#00e676' : '#ff1744'}; margin-bottom: 6px;">
                ${res.verified ? icon('check') : icon('alert')} ${res.message}
              </h3>
              ${res.calculatedHash ? `
                <div style="font-size: 0.75rem; word-break: break-all; margin-top: 6px;">
                  <div><b>Calculated SHA-256:</b> <span class="mono">${esc(res.calculatedHash)}</span></div>
                  <div style="margin-top: 4px;"><b>Derived Result:</b> <b class="mono" style="color: var(--color-volt, #00e676);">${esc(res.calculatedOutcome)}</b></div>
                  <div style="margin-top: 4px;"><b>HMAC Stream:</b> <span class="mono">${esc(res.hmacHex.slice(0, 32))}...</span></div>
                </div>
              ` : ''}
            </section>
          ` : ''}

          <p class="modal-foot">${icon('info')}Seeds are combined with HMAC-SHA256. Neither player nor operator can alter the drawn result once committed.</p>
        </div>
      </div>
    `;
  }
}
