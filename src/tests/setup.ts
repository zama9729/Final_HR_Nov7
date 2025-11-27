import '@testing-library/jest-dom';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {
    subtle: {
      digest: async () => new ArrayBuffer(0),
    },
  };
} else if (!globalThis.crypto.subtle) {
  (globalThis.crypto as any).subtle = {
    digest: async () => new ArrayBuffer(0),
  };
}

