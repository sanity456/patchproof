import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import source from '../../../contracts/patchproof.py?raw';
import deployment from '../deployment.json';

export const CHAIN_ID = 61999;
export const EXPLORER = studionet.blockExplorers.default.url;
export const CONTRACT_SOURCE = source;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CHECK_RE = /^[a-f0-9]{32}$/;
const ADDRESS_KEY = 'patchproof:studionet:contract';
const PENDING_KEY = 'patchproof:studionet:pending';

export function validAddress(value) { return ADDRESS_RE.test(value || '') && !/^0x0{40}$/i.test(value); }
export function validCheckId(value) { return CHECK_RE.test(value || ''); }
export function short(value) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—'; }
export function configuredAddress() {
  const fromBuild = import.meta.env.VITE_PATCHPROOF_CONTRACT_ADDRESS || deployment.contractAddress;
  const fromLocal = localStorage.getItem(ADDRESS_KEY);
  return validAddress(fromBuild) ? fromBuild : validAddress(fromLocal) ? fromLocal : '';
}
export function saveAddress(address) {
  if (!validAddress(address)) throw new Error('Enter a valid contract address.');
  localStorage.setItem(ADDRESS_KEY, address);
}
export function pendingAction() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}
export function rememberPending(action) { localStorage.setItem(PENDING_KEY, JSON.stringify(action)); }
export function forgetPending() { localStorage.removeItem(PENDING_KEY); }
export function getProvider() { return window.ethereum || null; }

export async function ensureStudionet(provider) {
  const chainHex = `0x${CHAIN_ID.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw new Error('Switch MetaMask to GenLayer Studionet (61999).');
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: chainHex,
      chainName: studionet.name,
      nativeCurrency: studionet.nativeCurrency,
      rpcUrls: studionet.rpcUrls.default.http,
      blockExplorerUrls: [EXPLORER],
    }] });
  }
}

export async function requestWallet() {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask is required to sign PatchProof transactions.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!validAddress(account)) throw new Error('No wallet account was selected.');
  await ensureStudionet(provider);
  return account;
}

export function client(account) {
  const provider = getProvider();
  return createClient({ chain: studionet, ...(account ? { account, provider } : {}) });
}

export async function read(address, functionName, args = []) {
  if (!validAddress(address)) throw new Error('Configure a deployed PatchProof contract first.');
  return client().readContract({ address, functionName, args });
}

export async function write(address, functionName, args, account) {
  return client(account).writeContract({ address, functionName, args, value: 0n });
}

export async function deploy(account) {
  return client(account).deployContract({ code: CONTRACT_SOURCE, args: [] });
}

export function successfulReceipt(receipt) {
  if (receipt?.statusName !== 'FINALIZED' && receipt?.status !== 7) return false;
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN' || receipt?.txExecutionResult === 1) return true;
  return receipt?.txExecutionResult == null && receipt?.txExecutionResultName == null
    && [1, 6, 'AGREE', 'MAJORITY_AGREE'].includes(receipt?.resultName ?? receipt?.result);
}

export async function waitForFinality(hash, account) {
  const receipt = await client(account && getProvider() ? account : undefined)
    .waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 5000, retries: 120 });
  if (!successfulReceipt(receipt)) throw new Error('The transaction did not finalize successfully. Check its explorer record.');
  return receipt;
}

export async function verifyContract(address) {
  const config = await read(address, 'get_config');
  if (config?.product !== 'PatchProof' || config?.rules_version !== 'patchproof-1') {
    throw new Error('That address is not a compatible PatchProof contract.');
  }
  return config;
}

export function newId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function checkLink(address, id) { return `${location.origin}${location.pathname}?contract=${address}&check=${id}`; }
export function explorerAddress(address) { return `${EXPLORER}/address/${address}`; }
export function explorerTx(hash) { return `${EXPLORER}/tx/${hash}`; }

export function safeError(error) {
  const message = String(error?.shortMessage || error?.message || 'Unknown error');
  if (/user rejected|user denied|rejected the request/i.test(message)) return 'Cancelled in MetaMask. No action was recorded.';
  if (/insufficient funds|not enough funds/i.test(message)) return 'This wallet needs GEN for the Studionet network fee. PatchProof sends 0 GEN.';
  if (/valid|MetaMask|required|Studionet|contract|finalize|Check|URL|version|owner|already/i.test(message)) return message.slice(0, 260);
  return 'The wallet or network could not complete that action. Check the transaction before retrying.';
}
