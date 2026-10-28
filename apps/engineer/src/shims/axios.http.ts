import axios, { AxiosResponse } from "axios";
import { API_URL } from "./env";

type TAxiosParams = { url: string; method: string; token?: string; baseUrl?: string; data?: object };

/** Same client as the admin site (src/libs/http/axios.http.ts), with a timeout for weak signal. */
const Client = async ({ method, url, baseUrl, data, token }: TAxiosParams) => {
  const res: AxiosResponse = await axios({
    method, url, baseURL: baseUrl || API_URL, timeout: 20000,
    headers: { "Content-Type": "application/json", Authorization: token && `Bearer ${token}` },
    data: data && JSON.stringify(data),
  });
  if (res.status === 200 || res.status === 201) return res.data;
};
export default Client;
