"use client";
import { Alert, AlertIcon, Badge, Box, Button, Card, CardBody, Flex, FormControl, FormHelperText, FormLabel, Heading, Input, Stack, Text, useToast } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { TJobDetail, api, errMsg } from "./fieldApi";
import ScanButton from "./ScanButton";

/** The action admin chose for this job, done step by step: install → new MAC → push (change device), push (re-push), new address (relocate). */
export default function JobActionPanel({ job, onChanged }: { job: TJobDetail; onChanged: () => void }) {
  const toast = useToast();
  const a = job.jobAction;
  const open = !["done", "cancelled"].includes(job.status);
  const [ready, setReady] = useState(false);
  const [mac, setMac] = useState("");
  const [address, setAddress] = useState("");
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const run = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api<any>("POST", `/field/jobs/${job.id}/action/${path}`, body),
    onSuccess: (r) => { toast({ status: r.data?.push && !r.data?.done ? "warning" : "success", title: r.message, duration: 5000 }); onChanged(); },
    onError: (e) => toast({ status: "error", title: errMsg(e), duration: 8000 }),
  });
  if (!a) return null;

  const macClean = mac.replace(/[^0-9a-fA-F]/g, "");
  const macOk = macClean.length === 12;
  // which step the engineer is on (0-based), from what the server has recorded
  const step = a.done ? a.steps.length
    : a.key === "change_device" ? (a.newMac ? 2 : ready ? 1 : 0)
    : (ready ? 1 : 0);
  const pushFailed = !!a.push && !a.done;

  const locate = () => {
    if (!navigator.geolocation) { toast({ status: "error", title: "This phone can't share its location." }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude }); setLocating(false); },
      () => { toast({ status: "error", title: "Location not available. Turn on location and try again." }); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <Card borderWidth="2px" borderColor={a.done ? "green.300" : "orange.300"}>
      <CardBody>
        <Flex justify="space-between" align="center" mb={1} gap={2}>
          <Heading size="sm">{a.label}</Heading>
          <Badge colorScheme={a.done ? "green" : "orange"}>{a.done ? "Done" : `Step ${Math.min(step + 1, a.steps.length)} of ${a.steps.length}`}</Badge>
        </Flex>
        <Text fontSize="sm" color="gray.600" mb={3}>{a.help}</Text>

        <Stack spacing={3}>
          {a.steps.map((label, i) => (
            <Flex key={i} gap={3} align="flex-start" opacity={i > step ? 0.45 : 1}>
              <Flex w="26px" h="26px" flexShrink={0} borderRadius="full" align="center" justify="center" fontSize="sm" fontWeight="bold"
                bg={i < step ? "green.500" : i === step ? "orange.400" : "gray.300"} color="white">{i < step ? "✓" : i + 1}</Flex>
              <Box flex="1" minW={0}>
                <Text fontWeight="semibold" fontSize="sm">{label}</Text>

                {/* step-specific content */}
                {i === 0 && a.key === "change_device" && a.oldMac && <Text fontSize="xs" color="gray.500">Old device: {a.oldMac}</Text>}
                {i === 0 && step === 0 && open && (
                  <Button mt={2} size="sm" colorScheme="orange" onClick={() => setReady(true)}>
                    {a.key === "repush" ? "Device is on and connected · Next" : "Installed · Next"}
                  </Button>
                )}

                {a.key === "change_device" && i === 1 && (
                  a.newMac ? <Text fontSize="xs" color="gray.500">New device: {a.newMac}</Text> : step === 1 && open && (
                    <FormControl mt={2}>
                      <FormLabel fontSize="xs" mb={1}>New ONU MAC (on the device label)</FormLabel>
                      <Flex gap={2}>
                        <Input size="sm" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="AA:BB:CC:11:22:33" autoCapitalize="characters" />
                        <ScanButton onResult={(t) => setMac(t)} />
                      </Flex>
                      {!macOk && mac && <FormHelperText color="red.500" fontSize="xs">12 characters, 0-9 and A-F.</FormHelperText>}
                      <Flex gap={2} mt={2}>
                        <Button size="sm" variant="ghost" onClick={() => setReady(false)}>Back</Button>
                        <Button size="sm" colorScheme="orange" isDisabled={!macOk} isLoading={run.isPending} onClick={() => run.mutate({ path: "device", body: { onuMac: macClean } })}>Save MAC · Next</Button>
                      </Flex>
                      <FormHelperText fontSize="xs">The old device&apos;s MAC is removed from the customer&apos;s record when you save.</FormHelperText>
                    </FormControl>
                  )
                )}

                {(a.key === "change_device" ? i === 2 : a.key === "repush" && i === 1) && (
                  <>
                    {a.push && (
                      <Stack spacing={1} mt={1} fontSize="xs">
                        <Text color={a.push.wifi.ok ? "green.600" : "red.500"}>{a.push.wifi.ok ? "✓" : "✗"} Wi-Fi: {a.push.wifi.note}</Text>
                        <Text color={a.push.wan.ok ? "green.600" : "red.500"}>{a.push.wan.ok ? "✓" : "✗"} Internet: {a.push.wan.note}</Text>
                      </Stack>
                    )}
                    {step === i && open && (
                      <>
                        <Text fontSize="xs" color="gray.500" mt={1}>Make sure the device is powered on and its PON light is steady, then push. It takes up to a minute.</Text>
                        <Flex gap={2} mt={2}>
                          {a.key === "repush" && !a.push && <Button size="sm" variant="ghost" onClick={() => setReady(false)}>Back</Button>}
                          <Button size="sm" colorScheme="orange" isLoading={run.isPending} loadingText="Pushing…" onClick={() => run.mutate({ path: "push" })}>
                            {pushFailed ? "Try again" : "Push settings"}
                          </Button>
                        </Flex>
                      </>
                    )}
                  </>
                )}

                {a.key === "relocate" && i === 1 && (
                  a.relocated ? <Text fontSize="xs" color="gray.500">{a.relocated.to}{a.relocated.latitude !== null ? " · location saved" : ""}</Text> : step === 1 && open && (
                    <Stack spacing={2} mt={2}>
                      <FormControl>
                        <FormLabel fontSize="xs" mb={1}>New address</FormLabel>
                        <Input size="sm" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House number, street, area, town" />
                      </FormControl>
                      <Button size="sm" variant="outline" isLoading={locating} onClick={locate}>
                        {gps ? `Location: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} · update` : "Use my current location"}
                      </Button>
                      <Flex gap={2}>
                        <Button size="sm" variant="ghost" onClick={() => setReady(false)}>Back</Button>
                        <Button size="sm" colorScheme="orange" isDisabled={address.trim().length < 5} isLoading={run.isPending}
                          onClick={() => run.mutate({ path: "relocate", body: { address: address.trim(), ...(gps || {}) } })}>Save new address</Button>
                      </Flex>
                    </Stack>
                  )
                )}
              </Box>
            </Flex>
          ))}
        </Stack>

        {pushFailed && open && (
          <Alert status="warning" mt={3} borderRadius="md" fontSize="sm"><AlertIcon />Not all settings reached the device. Check it is online, then try again. Call the NOC if it keeps failing.</Alert>
        )}
        {a.done && open && <Alert status="success" mt={3} borderRadius="md" fontSize="sm"><AlertIcon />Done. Test the service with the customer, then finish the job.</Alert>}
      </CardBody>
    </Card>
  );
}
