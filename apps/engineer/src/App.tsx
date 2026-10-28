import { Alert, AlertIcon, Box, Button, Center, FormControl, FormLabel, Heading, Input, InputGroup, InputRightElement, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import axios from "axios";
import FieldApp from "./field/FieldApp";
import { API_URL } from "./shims/env";
import token, { TOKEN_KEY } from "./shims/token";
import { queueAll } from "./field/fieldOffline";

type TUser = { firstName: string; lastName: string; type: string; email: string };
const USER_KEY = "field:user";
const savedUser = (): TUser | null => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } };
const STAFF = ["technician", "admin"];

/**
 * 9jaFiber Engineer: the field screens built into the app (they open without
 * signal). Login once; the phone keeps it. Work done offline waits in the app
 * and syncs when back online (see field/fieldOffline.ts).
 */
/** Sign out (the menu links to /logout): runs before the app renders. */
export function handleLogout() {
  if (!window.location.pathname.endsWith("/logout")) return false;
  const waiting = queueAll().filter((x) => !x.error).length;
  if (!waiting || window.confirm(`${waiting} item(s) have not synced yet. They stay on this phone and are sent after you sign in again. Sign out?`)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  window.location.replace(window.location.origin + "/");
  return true;
}

export default function App() {
  const [user, setUser] = useState<TUser | null>(token ? savedUser() : null);
  const [checking, setChecking] = useState(!!token && !savedUser());

  // refresh who is signed in when there is signal (the saved copy is used offline)
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
      .then((r) => {
        const u = r.data?.data as TUser;
        if (!u || !STAFF.includes(u.type)) { localStorage.removeItem(TOKEN_KEY); setUser(null); return; }
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setUser(u);
      })
      .catch((e) => {
        if (e?.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setUser(null); }
      })
      .finally(() => setChecking(false));
  }, []);

  if (!API_URL) return <Center minH="100vh" p={6}><Alert status="error">This build has no API address (API_URL). Ask the admin for a new APK.</Alert></Center>;
  if (checking) return <Center minH="100vh"><Spinner /></Center>;
  if (!token || !user) return <Login />;
  return <FieldApp name={`${user.firstName} ${user.lastName}`.trim()} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email: email.trim(), password }, { timeout: 20000 });
      const t = r.data?.data?.token as string | undefined;
      if (!t) throw new Error("No login");
      const u = await axios.get(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${t}` }, timeout: 20000 });
      const me = u.data?.data as TUser;
      if (!STAFF.includes(me?.type)) { setError("This app is for 9jaFiber engineers and installers."); return; }
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      window.location.replace(window.location.origin + "/");
    } catch (e: any) {
      setError(!e?.response ? "No connection. Signing in needs signal (after that, the app works offline)." : e.response.status === 401 || e.response.status === 400 ? "Wrong email or password." : e.response.data?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Center minH="100vh" bg="#111315" px={5}>
      <Box bg="white" borderRadius="xl" p={6} w="100%" maxW="380px">
        <Stack spacing={4}>
          <Box>
            <Heading size="md">9ja<Text as="span" color="#22a45d">Fiber</Text> Engineer</Heading>
            <Text fontSize="sm" color="gray.500">Sign in with your 9jaFiber staff login.</Text>
          </Box>
          {error && <Alert status="error" borderRadius="md" fontSize="sm"><AlertIcon />{error}</Alert>}
          <FormControl>
            <FormLabel fontSize="sm">Email</FormLabel>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="sm">Password</FormLabel>
            <InputGroup>
              <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email && password) submit(); }} />
              <InputRightElement width="4.5rem"><Button h="1.75rem" size="sm" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</Button></InputRightElement>
            </InputGroup>
          </FormControl>
          <Button colorScheme="green" isLoading={busy} isDisabled={!email || !password} onClick={submit}>Sign in</Button>
        </Stack>
      </Box>
    </Center>
  );
}
