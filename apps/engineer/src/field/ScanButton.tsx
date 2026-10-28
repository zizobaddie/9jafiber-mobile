"use client";
import { Box, Button, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text, useDisclosure } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

/**
 * Scans the barcode / QR label on the ONU with the phone camera (Chrome on
 * Android supports this). Where the phone can't, the field stays typeable.
 */
export default function ScanButton({ onResult, label = "Scan" }: { onResult: (text: string) => void; label?: string }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  // inside the 9jaFiber Android apps the phone's own scanner is used
  const nativeScanner = typeof window !== "undefined" ? (window as any).Capacitor?.Plugins?.CapacitorBarcodeScanner : null;
  const isApp = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
  const supported = (isApp && !!nativeScanner) || (typeof window !== "undefined" && "BarcodeDetector" in window);
  const scanNative = async () => {
    try {
      // hint 17 = any barcode type; the scanner shows its own camera screen
      const r = await nativeScanner.scanBarcode({ hint: 17, scanInstructions: "Point at the barcode on the ONU label", scanButton: false });
      const text = String(r?.ScanResult || "").trim();
      if (text) onResult(text);
    } catch {
      // cancelled or camera refused: nothing to do
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ["code_128", "code_39", "qr_code", "data_matrix", "ean_13"] });
        while (!stop) {
          const codes = await detector.detect(v).catch(() => []);
          if (codes.length) {
            onResult(String(codes[0].rawValue || "").trim());
            onClose();
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "Allow the camera to scan." : "The camera could not start.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen, onClose, onResult]);

  if (!supported) return null;
  return (
    <>
      <Button size="md" onClick={() => { if (isApp && nativeScanner) { scanNative(); return; } setError(""); onOpen(); }}>{label}</Button>
      <Modal isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay />
        <ModalContent bg="black">
          <ModalHeader color="white">Point at the barcode on the ONU label</ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody>
            <Box as="video" ref={video} w="100%" borderRadius="md" muted playsInline />
            {error && <Text color="red.300" mt={3}>{error}</Text>}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
