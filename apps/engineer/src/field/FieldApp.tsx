"use client";
import { Alert, AlertDescription, AlertIcon, Badge, Box, Button, Card, CardBody, Container, Divider, Flex, FormControl, FormHelperText, FormLabel, Heading, HStack, IconButton, Image, Input, Link, Menu, MenuButton, MenuItem, MenuList, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, SimpleGrid, Spinner, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, useDisclosure, useToast, Checkbox, Select } from "@chakra-ui/react";
import { ArrowBackIcon, HamburgerIcon, RepeatIcon } from "@chakra-ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import moment from "moment";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import SignaturePad from "./SignaturePad";
import ScanButton from "./ScanButton";
import { KIND, STATUS, TJob, TJobDetail, api, errMsg, photoUrl, shrink, syncNow, uploadPhoto } from "./fieldApi";
import { dismissQueued, useFieldSync } from "./fieldOffline";

const when = (d?: string | null) => (d ? moment(d).format("ddd D MMM, h:mm a") : "—");
const mapsUrl = (j: TJob) =>
  j.latitude !== null && j.longitude !== null
    ? `https://www.google.com/maps/dir/?api=1&destination=${j.latitude},${j.longitude}`
    : j.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}` : null;
const waLink = (phone?: string | null) => {
  const d = (phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d.startsWith("0") ? "234" + d.slice(1) : d}` : null;
};

/** The field app: a phone-first page for installers and fault engineers. */
export default function FieldApp({ name }: { name: string }) {
  const qc = useQueryClient();
  // with no signal react-query would pause requests; ours answer from the phone (cache / queue) instead
  useState(() => {
    qc.setDefaultOptions({ ...qc.getDefaultOptions(), queries: { ...qc.getDefaultOptions().queries, networkMode: "always" }, mutations: { ...qc.getDefaultOptions().mutations, networkMode: "always" } });
    return true;
  });
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get("job");
  const open = (id: string | null) => router.push(id ? `/field?job=${id}` : "/field");
  const pw = useDisclosure();
  return (
    <Box minH="100vh" bg="gray.50" _dark={{ bg: "gray.900" }}>
      <Flex as="header" bg="#2b3035" color="white" px={4} py={3} align="center" justify="space-between" position="sticky" top={0} zIndex={10}>
        <HStack spacing={3}>
          {jobId && <IconButton aria-label="Back" icon={<ArrowBackIcon />} size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }} onClick={() => open(null)} />}
          <Text fontWeight="bold">9ja<Text as="span" color="#22a45d">Fiber</Text> Field</Text>
        </HStack>
        <Menu>
          <MenuButton as={IconButton} aria-label="Menu" icon={<HamburgerIcon />} size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }} />
          <MenuList color="gray.800">
            <MenuItem isDisabled>{name}</MenuItem>
            <MenuItem onClick={pw.onOpen}>Change password</MenuItem>
            <MenuItem as="a" href="/logout">Sign out</MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      <SyncBanner />
      <Container maxW="lg" px={3} py={4}>
        {jobId ? <JobView id={jobId} onBack={() => open(null)} /> : <JobList onOpen={open} />}
      </Container>
      <PasswordModal isOpen={pw.isOpen} onClose={pw.onClose} />
    </Box>
  );
}

/** No signal / things waiting on the phone / things the server refused. */
function SyncBanner() {
  const s = useFieldSync(syncNow);
  if (s.online && !s.items.length) return null;
  return (
    <Box px={3} pt={3} maxW="lg" mx="auto">
      {!s.online && (
        <Alert status="warning" borderRadius="md" mb={2} fontSize="sm"><AlertIcon />No signal. You can keep working: what you do is kept on this phone and sent when you are back online.</Alert>
      )}
      {s.pending.length > 0 && (
        <Alert status="info" borderRadius="md" mb={2} fontSize="sm" alignItems="flex-start">
          <AlertIcon />
          <Box flex="1">
            <Text fontWeight="semibold">{s.pending.length} waiting to sync</Text>
            {s.pending.slice(0, 4).map((x) => <Text key={x.id} fontSize="xs">{x.label} · {moment(x.at).format("h:mm a")}</Text>)}
          </Box>
          <Button size="xs" ml={2} isLoading={s.syncing} isDisabled={!s.online} onClick={() => s.syncNow()}>Sync now</Button>
        </Alert>
      )}
      {s.failed.map((x) => (
        <Alert key={x.id} status="error" borderRadius="md" mb={2} fontSize="sm" alignItems="flex-start">
          <AlertIcon />
          <Box flex="1"><Text fontWeight="semibold">{x.label} was not accepted</Text><Text fontSize="xs">{x.error}</Text></Box>
          <Button size="xs" ml={2} onClick={() => dismissQueued(x.id)}>Dismiss</Button>
        </Alert>
      ))}
    </Box>
  );
}

function JobCard({ j, onOpen }: { j: TJob; onOpen: (id: string) => void }) {
  return (
    <Card onClick={() => onOpen(j.id)} cursor="pointer" borderLeft="4px solid" borderColor={`${KIND[j.kind].color}.400`}>
      <CardBody py={3} px={4}>
        <Flex justify="space-between" gap={2}>
          <Badge colorScheme={KIND[j.kind].color}>{KIND[j.kind].label}</Badge>
          <Text fontSize="xs" color="gray.500">{j.number}</Text>
        </Flex>
        <Text fontWeight="semibold" mt={1}>{j.title}</Text>
        {j.address && <Text fontSize="sm" color="gray.600" noOfLines={2}>{j.address}</Text>}
        <Flex gap={2} mt={2} wrap="wrap">
          <Badge variant="outline">{STATUS[j.status]}</Badge>
          {j.etaAt && <Badge variant="subtle" colorScheme="blue">ETA {moment(j.etaAt).format("h:mm a")}</Badge>}
          {j.needsEta && <Badge colorScheme="red">Set ETA</Badge>}
        </Flex>
      </CardBody>
    </Card>
  );
}

function JobList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery<Awaited<ReturnType<typeof api<{ mine: TJob[]; available: TJob[]; done: TJob[] }>>>, Error>({
    queryKey: ["fieldJobs"], queryFn: () => api("GET", "/field/jobs"), refetchInterval: 30000,
  });
  const d = q.data?.data;
  // keep my jobs' details on the phone so they open without signal
  useEffect(() => {
    if (q.data?.offline || !d?.mine?.length) return;
    d.mine.forEach((j) => { api("GET", `/field/jobs/${j.id}`).catch(() => undefined); });
  }, [q.data?.offline, d?.mine]);
  const list = (rows: TJob[] | undefined, empty: string) => (
    <Stack spacing={3}>
      {!rows?.length ? <Text color="gray.500" textAlign="center" py={8}>{empty}</Text> : rows.map((j) => <JobCard key={j.id} j={j} onOpen={onOpen} />)}
    </Stack>
  );
  return (
    <>
      <Flex justify="space-between" align="center" mb={3}>
        <Heading size="md">Jobs{q.data?.offline && <Badge ml={2} colorScheme="orange" fontSize="0.6em">saved {moment(q.data.cachedAt).format("h:mm a")}</Badge>}</Heading>
        <IconButton aria-label="Refresh" icon={<RepeatIcon />} size="sm" isLoading={q.isFetching} onClick={() => q.refetch()} />
      </Flex>
      {q.isLoading ? <Flex justify="center" py={10}><Spinner /></Flex> : q.isError ? <Alert status="error"><AlertIcon />{errMsg(q.error)}</Alert> : (
        <Tabs variant="soft-rounded" colorScheme="green" isFitted>
          <TabList mb={3}>
            <Tab>Mine {d?.mine.length ? `(${d.mine.length})` : ""}</Tab>
            <Tab>Open {d?.available.length ? `(${d.available.length})` : ""}</Tab>
            <Tab>Done</Tab>
          </TabList>
          <TabPanels>
            <TabPanel p={0}>{list(d?.mine, "No jobs assigned to you. Check Open for jobs nobody has taken.")}</TabPanel>
            <TabPanel p={0}>{list(d?.available, "No open jobs.")}</TabPanel>
            <TabPanel p={0}>{list(d?.done, "Nothing finished yet.")}</TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </>
  );
}

function Photo({ jobId, id, caption }: { jobId: string; id: string; caption: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    photoUrl(jobId, id).then((u) => { url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [jobId, id]);
  return (
    <Box>
      {src ? <Image src={src} alt={caption || "photo"} borderRadius="md" objectFit="cover" w="100%" h="110px" /> : <Flex h="110px" bg="gray.100" borderRadius="md" align="center" justify="center"><Spinner size="sm" /></Flex>}
      {caption && <Text fontSize="xs" color="gray.600" noOfLines={1}>{caption}</Text>}
    </Box>
  );
}

function JobView({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery<Awaited<ReturnType<typeof api<TJobDetail>>>, Error>({
    queryKey: ["fieldJob", id], queryFn: () => api("GET", `/field/jobs/${id}`), refetchInterval: 30000,
  });
  const [eta, setEta] = useState("");
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const done = useDisclosure();
  const restored = useDisclosure();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["fieldJob", id] }); qc.invalidateQueries({ queryKey: ["fieldJobs"] }); };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api<any>("POST", `/field/jobs/${id}/${path}`, body),
    onSuccess: (r) => { toast({ status: "success", title: r.message, duration: 4000 }); refresh(); },
    onError: (e) => toast({ status: "error", title: errMsg(e), duration: 6000 }),
  });
  const j = q.data?.data;
  if (q.isLoading) return <Flex justify="center" py={10}><Spinner /></Flex>;
  if (q.isError || !j) return <Alert status="error"><AlertIcon />{errMsg(q.error)}</Alert>;
  const isOpen = !["done", "cancelled"].includes(j.status);
  const map = mapsUrl(j);
  const phone = j.customer?.phone || j.contactPhone;
  const wa = waLink(phone);
  const setEtaIn = (mins: number) => act.mutate({ path: "eta", body: { etaAt: moment().add(mins, "minutes").toISOString() } });

  const addPhoto = async (f?: File | null) => {
    if (!f) return;
    setUploading(true);
    try {
      await uploadPhoto(id, await shrink(f), caption);
      setCaption("");
      toast({ status: "success", title: "Photo added", duration: 3000 });
      refresh();
    } catch (e) {
      toast({ status: "error", title: errMsg(e), duration: 6000 });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Flex gap={2} align="center" wrap="wrap">
          <Badge colorScheme={KIND[j.kind].color}>{KIND[j.kind].label}</Badge>
          <Badge variant="outline">{STATUS[j.status]}</Badge>
          <Text fontSize="sm" color="gray.500">{j.number}</Text>
          {q.data?.offline && <Badge colorScheme="orange">Offline · saved {moment(q.data.cachedAt).format("h:mm a")}</Badge>}
        </Flex>
        <Heading size="md" mt={2}>{j.title}</Heading>
        {j.details && <Text fontSize="sm" color="gray.600" mt={1}>{j.details}</Text>}
        {j.assignedName && <Text fontSize="xs" color="gray.500" mt={1}>Assigned to {j.assignedName}</Text>}
      </Box>

      {j.needsEta && isOpen && (
        <Alert status="error" borderRadius="md" flexDirection="column" alignItems="stretch" gap={2}>
          <Flex align="center"><AlertIcon /><Text fontWeight="semibold">Set an ETA: customers are waiting to hear when service will be back.</Text></Flex>
          <SimpleGrid columns={4} spacing={2}>
            {[[30, "30 min"], [60, "1 hr"], [120, "2 hrs"], [240, "4 hrs"]].map(([m, l]) => (
              <Button key={m} size="sm" colorScheme="red" variant="outline" bg="white" isLoading={act.isPending} onClick={() => setEtaIn(m as number)}>{l}</Button>
            ))}
          </SimpleGrid>
        </Alert>
      )}

      {j.outage && (
        <Card><CardBody>
          <Text fontWeight="semibold">{j.outage.title}</Text>
          <Text fontSize="sm" color="gray.600">{j.outage.area || "Area unknown"} · since {when(j.outage.detectedAt)}</Text>
          <SimpleGrid columns={3} mt={3} textAlign="center">
            <Box><Text fontSize="2xl" fontWeight="bold" color="red.500">{j.outage.stillOffline}</Text><Text fontSize="xs">still offline</Text></Box>
            <Box><Text fontSize="2xl" fontWeight="bold" color="green.500">{j.outage.backOnline}</Text><Text fontSize="xs">back online</Text></Box>
            <Box><Text fontSize="2xl" fontWeight="bold">{j.outage.notifiedCount}</Text><Text fontSize="xs">customers told</Text></Box>
          </SimpleGrid>
        </CardBody></Card>
      )}

      {(j.customer || j.address) && (
        <Card><CardBody>
          {j.customer && <Text fontWeight="semibold">{j.customer.name}</Text>}
          {j.address && <Text fontSize="sm" color="gray.600">{j.address}</Text>}
          {j.plan && <Text fontSize="xs" color="gray.500">Plan: {j.plan.name}</Text>}
          <SimpleGrid columns={3} spacing={2} mt={3}>
            {phone && <Button as={Link} href={`tel:${phone}`} size="sm" colorScheme="green">Call</Button>}
            {wa && <Button as={Link} href={wa} isExternal size="sm" variant="outline">WhatsApp</Button>}
            {map && <Button as={Link} href={map} isExternal size="sm" variant="outline">Directions</Button>}
          </SimpleGrid>
        </CardBody></Card>
      )}

      {isOpen && (
        <Card><CardBody>
          <Stack spacing={3}>
            {!j.assignedTo && <Button colorScheme="green" size="lg" isLoading={act.isPending} onClick={() => act.mutate({ path: "take" })}>Take this job</Button>}
            {j.assignedTo && (
              <SimpleGrid columns={2} spacing={2}>
                <Button size="lg" variant={j.status === "en_route" ? "solid" : "outline"} colorScheme="blue" isDisabled={j.status === "en_route" || j.status === "on_site"}
                  onClick={() => act.mutate({ path: "status", body: { status: "en_route" } })}>On my way</Button>
                <Button size="lg" variant={j.status === "on_site" ? "solid" : "outline"} colorScheme="blue" isDisabled={j.status === "on_site"}
                  onClick={() => act.mutate({ path: "status", body: { status: "on_site" } })}>Arrived</Button>
              </SimpleGrid>
            )}
            <FormControl>
              <FormLabel fontSize="sm" mb={1}>{j.kind === "fault" ? "Service back by (ETA)" : "Expected time"} {j.etaAt && <Badge ml={1} colorScheme="blue">{when(j.etaAt)}</Badge>}</FormLabel>
              <Flex gap={2}>
                <Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
                <Button isDisabled={!eta} isLoading={act.isPending} onClick={() => act.mutate({ path: "eta", body: { etaAt: new Date(eta).toISOString() } })}>Save</Button>
              </Flex>
              <FormHelperText fontSize="xs">{j.kind === "fault" ? "Every customer told about this outage gets the new time by SMS/email." : "The customer gets the time by SMS/email."}</FormHelperText>
            </FormControl>
          </Stack>
        </CardBody></Card>
      )}

      <Card><CardBody>
        <Text fontWeight="semibold" mb={2}>Photos</Text>
        {!j.photosEnabled ? <Text fontSize="sm" color="gray.500">Photo storage is not set up yet.</Text> : (
          <>
            {!!j.photos.length && <SimpleGrid columns={3} spacing={2} mb={3}>{j.photos.map((p) => <Photo key={p.id} jobId={j.id} id={p.id} caption={p.caption} />)}</SimpleGrid>}
            {isOpen && (
              <Stack spacing={2}>
                <Input size="sm" placeholder="Caption (optional), e.g. ONU mounted" value={caption} onChange={(e) => setCaption(e.target.value)} />
                <Button as="label" isLoading={uploading} cursor="pointer" variant="outline">
                  Take or choose a photo
                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                </Button>
              </Stack>
            )}
          </>
        )}
      </CardBody></Card>

      <Card><CardBody>
        <Text fontWeight="semibold" mb={2}>Notes and history</Text>
        {isOpen && (
          <Flex gap={2} mb={3}>
            <Input size="sm" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" isDisabled={!note.trim()} onClick={() => act.mutate({ path: "notes", body: { text: note } }, { onSuccess: () => setNote("") })}>Add</Button>
          </Flex>
        )}
        <Stack spacing={2}>
          {[...j.events].reverse().map((e, i) => (
            <Box key={i} fontSize="sm">
              <Text>{e.text}</Text>
              <Text fontSize="xs" color="gray.500">{when(e.at)}{e.by ? ` · ${e.by}` : ""}</Text>
            </Box>
          ))}
        </Stack>
      </CardBody></Card>

      {isOpen && j.assignedTo && (
        j.kind === "fault" ? (
          <Button colorScheme="green" size="lg" onClick={restored.onOpen}>Service restored</Button>
        ) : (
          <Button colorScheme="green" size="lg" onClick={done.onOpen}>{j.kind === "installation" ? (j.activatedAt ? "Customer sign-off" : "Activate service") : "Finish repair"}</Button>
        )
      )}
      {j.status === "done" && j.signedName && <Text fontSize="sm" color="gray.600">Signed off by {j.signedName}{j.onuMac ? ` · ONU ${j.onuMac}` : ""}</Text>}
      <Divider />
      <Button variant="ghost" onClick={onBack}>Back to jobs</Button>

      <Modal isOpen={restored.isOpen} onClose={restored.onClose} isCentered>
        <ModalOverlay />
        <ModalContent mx={3}>
          <ModalHeader>Service restored?</ModalHeader>
          <ModalBody fontSize="sm">
            This closes {j.number}, ends the outage and texts/emails the {j.outage?.notifiedCount ?? 0} customer(s) who were told that service is back.
            {j.outage && j.outage.stillOffline > 0 && <Alert status="warning" mt={3} borderRadius="md" fontSize="sm"><AlertIcon />{j.outage.stillOffline} device(s) still show offline. They may need a router restart.</Alert>}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={restored.onClose}>Not yet</Button>
            <Button colorScheme="green" isLoading={act.isPending} onClick={() => act.mutate({ path: "complete", body: {} }, { onSuccess: restored.onClose })}>Yes, service is back</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <FinishModal job={j} isOpen={done.isOpen} onClose={done.onClose} onDone={refresh} />
    </Stack>
  );
}

function WifiCard({ ssid, wifiKey, note }: { ssid: string; wifiKey: string; note?: string | null }) {
  return (
    <Box borderWidth="2px" borderColor="green.400" borderRadius="lg" p={4} bg="green.50" _dark={{ bg: "green.900" }}>
      <Text fontSize="xs" textTransform="uppercase" color="green.700" _dark={{ color: "green.200" }} fontWeight="bold">Customer Wi-Fi (emailed to the customer)</Text>
      <SimpleGrid columns={2} spacing={2} mt={2}>
        <Box><Text fontSize="xs" color="gray.500">Name</Text><Text fontFamily="mono" fontWeight="bold" wordBreak="break-all">{ssid}</Text></Box>
        <Box><Text fontSize="xs" color="gray.500">Password</Text><Text fontFamily="mono" fontWeight="bold" wordBreak="break-all">{wifiKey}</Text></Box>
      </SimpleGrid>
      {note && <Alert status="warning" mt={3} borderRadius="md" fontSize="sm"><AlertIcon />{note}</Alert>}
    </Box>
  );
}

/** Installations: step 1 activate (ONU MAC in, Wi-Fi generated and emailed); step 2 test and customer sign-off. Repairs: sign-off. */
function FinishModal({ job, isOpen, onClose, onDone }: { job: TJobDetail; isOpen: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const install = job.kind === "installation";
  const activated = install && !!job.activatedAt;
  const [f, setF] = useState({ onuMac: job.onuMac || "", onuSerial: job.onuSerial || "", serviceAreaId: job.installation?.serviceAreaId || "", notes: "", signedName: job.customer?.name || "", signature: "", tested: false });
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const areas = useQuery({ queryKey: ["fieldAreas"], queryFn: () => api<{ id: string; name: string; city: string }[]>("GET", "/field/service-areas"), enabled: isOpen && install && !activated });
  const macOk = /^[0-9A-F]{12}$/.test(f.onuMac.replace(/[^0-9A-Fa-f]/g, "").toUpperCase());
  const activate = useMutation({
    mutationFn: () => api<any>("POST", `/field/jobs/${job.id}/activate`, { onuMac: f.onuMac, serviceAreaId: f.serviceAreaId || null }),
    onSuccess: (r) => {
      setDeviceNote(r.data?.queued ? "Activation is waiting to sync: the service switches on and the Wi-Fi details appear here (and go to the customer) once it is sent."
        : r.data?.setOnDevice ? null : `Set this Wi-Fi on the ONU now${r.data?.deviceNote ? ` (not set automatically: ${r.data.deviceNote})` : ""}.`);
      toast({ status: "success", title: r.message, duration: 6000 });
      onDone();
    },
    onError: (e) => toast({ status: "error", title: errMsg(e), duration: 7000 }),
  });
  const ready = (!install || (activated && f.tested)) && f.signedName.trim() && f.signature;
  const save = useMutation({
    mutationFn: () => api<any>("POST", `/field/jobs/${job.id}/complete`, { notes: f.notes, onuSerial: f.onuSerial, signedName: f.signedName, signature: f.signature }),
    onSuccess: (r) => { toast({ status: "success", title: r.message, duration: 5000 }); onClose(); onDone(); },
    onError: (e) => toast({ status: "error", title: errMsg(e), duration: 7000 }),
  });
  const title = !install ? "Finish repair" : activated ? "Test and customer sign-off" : "Activate service";
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{title} · {job.number}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4} maxW="lg" mx="auto">
            {install && !activated && (
              <>
                <Text fontSize="sm" color="gray.500">Step 1 of 2. Enter the ONU MAC: the system switches the service on, creates the customer&apos;s 9jaFiber Wi-Fi and emails it to them.</Text>
                <FormControl isRequired>
                  <FormLabel>ONU MAC address</FormLabel>
                  <Flex gap={2}>
                    <Input value={f.onuMac} onChange={(e) => setF({ ...f, onuMac: e.target.value })} placeholder="AA:BB:CC:11:22:33" autoCapitalize="characters" />
                    <ScanButton onResult={(t) => setF((x) => ({ ...x, onuMac: t }))} />
                  </Flex>
                  {!macOk && f.onuMac && <FormHelperText color="red.500">12 characters, 0-9 and A-F.</FormHelperText>}
                </FormControl>
                <FormControl>
                  <FormLabel>Service area</FormLabel>
                  <Select placeholder="Not sure (set the Wi-Fi on the ONU by hand)" value={f.serviceAreaId} onChange={(e) => setF({ ...f, serviceAreaId: e.target.value })}>
                    {(areas.data?.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}, {a.city}</option>)}
                  </Select>
                  <FormHelperText>With the area, the Wi-Fi is set on the ONU automatically.</FormHelperText>
                </FormControl>
              </>
            )}
            {activated && job.installation?.ssid && job.installation?.wifiKey && (
              <WifiCard ssid={job.installation.ssid} wifiKey={job.installation.wifiKey} note={deviceNote} />
            )}
            {(!install || activated) && (
              <>
                {install && (
                  <>
                    <Text fontSize="sm" color="gray.500">Step 2 of 2. Connect a phone to this Wi-Fi, check the internet works, then let the customer sign.</Text>
                    <Checkbox isChecked={f.tested} onChange={(e) => setF({ ...f, tested: e.target.checked })}>I have tested the Wi-Fi and internet with the customer</Checkbox>
                    <FormControl>
                      <FormLabel>ONU serial number</FormLabel>
                      <Flex gap={2}>
                        <Input value={f.onuSerial} onChange={(e) => setF({ ...f, onuSerial: e.target.value })} autoCapitalize="characters" />
                        <ScanButton onResult={(t) => setF((x) => ({ ...x, onuSerial: t }))} />
                      </Flex>
                    </FormControl>
                  </>
                )}
                <FormControl>
                  <FormLabel>Notes</FormLabel>
                  <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={install ? "Where the ONU is mounted, cable length…" : "What was wrong and what you did"} />
                </FormControl>
                <Divider />
                <Text fontWeight="semibold">Customer sign-off</Text>
                <FormControl isRequired><FormLabel>Customer name</FormLabel><Input value={f.signedName} onChange={(e) => setF({ ...f, signedName: e.target.value })} /></FormControl>
                <SignaturePad onChange={(s) => setF((x) => ({ ...x, signature: s }))} />
                <Text fontSize="xs" color="gray.500">By signing, the customer confirms the work is done{install ? " and the internet is working" : ""}.</Text>
              </>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>{install && !activated ? "Cancel" : "Close"}</Button>
          {install && !activated ? (
            <Button colorScheme="green" isDisabled={!macOk} isLoading={activate.isPending} onClick={() => activate.mutate()}>Activate service</Button>
          ) : (
            <Button colorScheme="green" isDisabled={!ready} isLoading={save.isPending} onClick={() => save.mutate()}>{install ? "Complete installation" : "Complete repair"}</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function PasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const save = useMutation({
    mutationFn: () => api<any>("POST", "/auth/change-password", { currentPassword: cur, newPassword: next }),
    onSuccess: () => { toast({ status: "success", title: "Password changed", duration: 4000 }); setCur(""); setNext(""); onClose(); },
    onError: (e) => toast({ status: "error", title: errMsg(e), duration: 6000 }),
  });
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalHeader>Change password</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3}>
            <FormControl><FormLabel>Current password</FormLabel><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></FormControl>
            <FormControl><FormLabel>New password</FormLabel><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /><FormHelperText>At least 8 characters.</FormHelperText></FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter><Button colorScheme="green" isDisabled={!cur || next.length < 8} isLoading={save.isPending} onClick={() => save.mutate()}>Save</Button></ModalFooter>
      </ModalContent>
    </Modal>
  );
}
