import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, beforeEach, expect, beforeAll } from "vitest";
import { OnboardingDocsUploader } from "../OnboardingDocsUploader";

vi.mock("@/lib/api", () => ({
  api: {
    getOnboardingDocuments: vi.fn().mockResolvedValue({ documents: [] }),
  },
}));

vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn();
  return {
    useToast: () => ({ toast }),
  };
});

const createMockResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("OnboardingDocsUploader", () => {
  const digestMock = vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer);

  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        subtle: {
          digest: digestMock,
        },
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    digestMock.mockClear();
  });

  it("uploads document successfully and triggers callbacks", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse({ url: "https://example.com/upload", key: "key-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(createMockResponse({ success: true }));

    global.fetch = mockFetch as any;

    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onSuccess = vi.fn();

    const { container } = render(
      <OnboardingDocsUploader
        employeeId="emp-1"
        onUploadStart={onStart}
        onUploadEnd={onEnd}
        onUploadSuccess={onSuccess}
      />
    );

    const input = container.querySelector('#file-ADDRESS_PROOF') as HTMLInputElement;
    const file = new File(["hello world"], "id-proof.pdf", { type: "application/pdf" });
    await act(async () => {
      await fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onStart).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(digestMock).toHaveBeenCalled();
  });

  it("handles upload failure gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse({ error: "failure" }, 400));
    global.fetch = mockFetch as any;

    const onEnd = vi.fn();

    const { container } = render(<OnboardingDocsUploader employeeId="emp-1" onUploadEnd={onEnd} />);

    const input = container.querySelector('#file-ADDRESS_PROOF') as HTMLInputElement;
    const file = new File(["hello world"], "id-proof.pdf", { type: "application/pdf" });
    await act(async () => {
      await fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(onEnd).toHaveBeenCalled();
  });
});

