import './styles.css';
import {
  configuredAddress, saveAddress, validAddress, validCheckId, short, getProvider,
  requestWallet, read, write, deploy, waitForFinality, verifyContract, newId,
  pendingAction, rememberPending, forgetPending, checkLink, explorerAddress, explorerTx, safeError,
} from './lib/chain.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const linkedContract = params.get('contract') || '';
const linkedCheck = params.get('check') || '';

const state = {
  account: '',
  contract: validAddress(linkedContract) ? linkedContract : configuredAddress(),
  verified: false,
  checkId: validCheckId(linkedCheck) ? linkedCheck : '',
  check: null,
  checks: [],
  busy: false,
  notice: '',
  error: '',
  modal: null,
  pending: pendingAction(),
};

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const stamp = value => value ? new Date(Number(value) * 1000).toLocaleString() : '—';
const badge = status => `<span class="badge badge-${esc(status.toLowerCase())}">${esc(status)}</span>`;
const button = (label, action, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;

function renderHeader() {
  return `<header><a class="brand" href="${location.pathname}"><span class="mark"><i></i><i></i></span><span>patch<strong>proof</strong></span></a><nav><a href="#how">How it works</a><a href="#checker">New check</a></nav><div class="network"><span></span> GENLAYER STUDIONET</div>${button(state.account ? short(state.account) : 'Connect wallet', 'connect', 'class="wallet"')}</header>`;
}

function renderAlert() {
  const text = state.error || state.notice;
  if (!text) return '';
  return `<div class="alert ${state.error ? 'error' : ''}"><span>${esc(text)}</span>${state.pending?.hash ? `<a href="${esc(explorerTx(state.pending.hash))}" target="_blank" rel="noopener">Explorer ↗</a>` : ''}${button('×', 'dismiss', 'aria-label="Dismiss"')}</div>`;
}

function renderSetup() {
  if (state.verified) return '';
  return `<section class="setup"><div><span class="eyebrow">CONTRACT SETUP</span><h2>Connect the proof layer.</h2><p>Deploy a fresh PatchProof contract, or verify an existing Studionet address.</p></div><div class="setup-actions"><input id="contract-address" placeholder="0x… contract address" value="${esc(state.contract)}" />${button('Use address', 'use-address', 'class="outline"')}${button('Deploy PatchProof', 'review-deploy', `class="solid" ${state.busy ? 'disabled' : ''}`)}</div></section>`;
}

function renderHero() {
  return `<section class="hero"><div><span class="eyebrow">UPGRADES, WITH RECEIPTS</span><h1>Know what breaks<br /><em>before you upgrade.</em></h1><p>Describe how your app uses a dependency. PatchProof reads the release notes and migration guide, then GenLayer validators publish a cited compatibility verdict.</p><div class="hero-actions"><a class="cta" href="#checker">Check a release ↘</a><a href="#how">See the method</a></div></div><div class="proof-visual"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="core">PP</div><div class="signal signal-a"><small>SOURCE 01</small><b>RELEASE</b></div><div class="signal signal-b"><small>SOURCE 02</small><b>MIGRATION</b></div><div class="signal signal-c"><small>CONSENSUS</small><b>CITED</b></div></div></section>`;
}

function renderMethod() {
  return `<section id="how" class="method"><div class="section-title"><span class="eyebrow">THE METHOD</span><h2>From vague release notes<br />to an inspectable decision.</h2></div><div class="steps"><article><b>01</b><h3>Declare real usage</h3><p>Explain the functions, behavior, and assumptions your application relies on.</p></article><article><b>02</b><h3>Pin two sources</h3><p>Provide the exact release page and migration guide the validators must inspect.</p></article><article><b>03</b><h3>Reach consensus</h3><p>Independent validators compare the sources to your usage and agree on the risk band.</p></article><article><b>04</b><h3>Keep the record</h3><p>The verdict, reasoning, citations, versions, and source URLs remain readable on-chain.</p></article></div></section>`;
}

function renderForm() {
  return `<section id="checker" class="checker"><div class="section-title"><span class="eyebrow">NEW RELEASE CHECK</span><h2>Describe the upgrade.</h2><p>Use public, version-specific HTTPS pages. Every field becomes part of the public record.</p></div><form id="check-form"><div class="field wide"><label for="package">Package or library</label><input id="package" name="package" maxlength="120" required placeholder="example-lib" /></div><div class="field"><label for="current">Current version</label><input id="current" name="current" maxlength="80" required placeholder="1.8.0" /></div><div class="arrow">→</div><div class="field"><label for="target">Target version</label><input id="target" name="target" maxlength="80" required placeholder="2.0.0" /></div><div class="field full"><label for="usage">How does your application use it?</label><textarea id="usage" name="usage" minlength="40" maxlength="2400" required placeholder="Name the APIs, behavior, configuration, and assumptions your application relies on."></textarea><small>40–2,400 UTF-8 bytes</small></div><div class="field full"><label for="release">Pinned release notes URL</label><input id="release" name="release" type="url" required placeholder="https://github.com/org/repo/releases/tag/v2.0.0" /></div><div class="field full"><label for="migration">Pinned migration guide URL</label><input id="migration" name="migration" type="url" required placeholder="https://docs.example.com/v2/migration" /></div><div class="form-foot"><p>PatchProof attaches 0 GEN. A normal Studionet network fee may apply.</p><button class="solid" type="submit" ${!state.verified || state.busy ? 'disabled' : ''}>Create public check ↗</button></div></form></section>`;
}

function renderCitation(item) {
  return `<blockquote><span>${esc(item.source)}</span><p>“${esc(item.passage)}”</p><small>${esc(item.why)}</small></blockquote>`;
}

function renderCheck() {
  if (!state.check) return '';
  const c = state.check;
  const a = c.analysis || {};
  return `<section class="result"><div class="result-head"><div><span class="eyebrow">CHECK ${esc(c.id.slice(0, 10).toUpperCase())}</span><h2>${esc(c.package_name)} <small>${esc(c.current_version)} → ${esc(c.target_version)}</small></h2></div>${badge(c.status)}</div><div class="result-grid"><article><span class="label">DECLARED USAGE</span><p>${esc(c.usage_context)}</p></article><article><span class="label">SOURCES</span><a href="${esc(c.release_url)}" target="_blank" rel="noopener">Release notes ↗</a><a href="${esc(c.migration_url)}" target="_blank" rel="noopener">Migration guide ↗</a></article></div>${c.status === 'PENDING' ? `<div class="pending-card"><div><h3>Ready for validator review.</h3><p>The sources and usage are locked. Start consensus to publish the result.</p></div>${state.account?.toLowerCase() === c.owner ? button('Run consensus ↗', 'review-evaluate', `class="solid" ${state.busy ? 'disabled' : ''}`) : '<span>Connect the owner wallet to evaluate.</span>'}</div>` : `<div class="analysis"><div class="verdict"><span class="label">CONSENSUS VERDICT</span><h3>${esc(a.verdict)}</h3><dl><div><dt>Severity</dt><dd>${esc(a.severity)}</dd></div><div><dt>Affected</dt><dd>${a.affected ? 'YES' : 'NO'}</dd></div><div><dt>Attempts</dt><dd>${esc(c.attempts)}</dd></div></dl></div><div class="reason"><h3>${esc(a.summary || 'No summary returned.')}</h3><p>${esc(a.recommended_action || '')}</p>${Array.isArray(a.citations) && a.citations.length ? `<div class="citations">${a.citations.map(renderCitation).join('')}</div>` : ''}</div></div>${c.status === 'UNVERIFIABLE' && state.account?.toLowerCase() === c.owner ? button('Retry source review ↗', 'review-evaluate', `class="outline retry" ${state.busy ? 'disabled' : ''}`) : ''}`}<div class="result-foot"><span>Created ${esc(stamp(c.created_at))}</span><button type="button" data-action="copy-link">Copy public link</button></div></section>`;
}

function renderHistory() {
  if (!state.account || !state.verified) return '';
  return `<section class="history"><div class="section-title compact"><span class="eyebrow">YOUR RECORDS</span><h2>Recent checks</h2></div>${state.checks.length ? `<div class="history-list">${state.checks.map(c => `<button type="button" data-action="open-check" data-id="${esc(c.id)}"><span><small>${esc(c.package_name)}</small><b>${esc(c.current_version)} → ${esc(c.target_version)}</b></span>${badge(c.status)}<i>↗</i></button>`).join('')}</div>` : '<div class="empty">No checks from this wallet yet.</div>'}</section>`;
}

function renderModal() {
  if (!state.modal) return '';
  return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><span class="eyebrow">FINAL REVIEW</span><h2>${esc(state.modal.title)}</h2><p>${esc(state.modal.detail)}</p><div class="modal-note">The transaction sends 0 GEN. The record and cited result become public after finality.</div><label><input id="confirm-box" type="checkbox" /> I reviewed the wallet, network, sources, and public content.</label><div class="modal-actions">${button('Back', 'close-modal', 'class="outline"')}${button(state.modal.label, state.modal.action, 'class="solid" id="confirm-action" disabled')}</div></div></div>`;
}

function render() {
  app.innerHTML = `${renderHeader()}<main>${renderAlert()}${renderSetup()}${renderHero()}${renderCheck()}${renderForm()}${renderHistory()}${renderMethod()}</main><footer><span>PATCHPROOF / RULES V1</span><span>GENLAYER CONSENSUS · PUBLIC SOURCES · 0 GEN VALUE</span>${state.contract ? `<a href="${esc(explorerAddress(state.contract))}" target="_blank" rel="noopener">CONTRACT ${esc(short(state.contract))} ↗</a>` : '<span>CONTRACT NOT CONFIGURED</span>'}</footer>${renderModal()}`;
}

function message(value, kind = 'notice') {
  state.error = kind === 'error' ? value : '';
  state.notice = kind === 'notice' ? value : '';
  render();
}

async function refresh() {
  if (!validAddress(state.contract)) { state.verified = false; render(); return; }
  try {
    await verifyContract(state.contract);
    state.verified = true;
    state.check = state.checkId ? await read(state.contract, 'get_check', [state.checkId]) : null;
    if (state.account) {
      const page = await read(state.contract, 'list_checks', [state.account, 0n, 20n]);
      state.checks = Array.isArray(page?.items) ? page.items.slice().reverse() : [];
    }
    state.error = '';
  } catch (error) {
    state.verified = false;
    state.error = safeError(error);
  }
  render();
}

async function connect() {
  try {
    state.account = await requestWallet();
    message(`Connected ${short(state.account)} on Studionet.`);
    await refresh();
  } catch (error) { message(safeError(error), 'error'); }
}

function setCheckId(id) {
  state.checkId = id;
  const url = new URL(location.href);
  if (state.contract) url.searchParams.set('contract', state.contract);
  url.searchParams.set('check', id);
  history.replaceState({}, '', url);
}

async function perform(kind, transaction, verify) {
  if (state.busy) return;
  state.busy = true; state.modal = null; state.error = ''; state.notice = `Preparing ${kind}…`; render();
  try {
    state.account = await requestWallet();
    const hash = await transaction();
    if (!/^0x[\da-fA-F]{64}$/.test(hash || '')) throw new Error('Wallet did not return a valid transaction hash.');
    state.pending = { kind, hash, account: state.account, contract: state.contract, checkId: state.checkId };
    rememberPending(state.pending);
    state.notice = `${kind} submitted. Waiting for validator consensus…`; render();
    const receipt = await waitForFinality(hash, state.account);
    await verify(receipt);
    forgetPending(); state.pending = null;
    state.notice = `${kind} finalized successfully.`;
    await refresh();
  } catch (error) {
    state.error = safeError(error); state.notice = '';
  } finally { state.busy = false; render(); }
}

async function finishDeployment(receipt) {
  const candidate = receipt?.txDataDecoded?.contractAddress || receipt?.to_address || receipt?.recipient;
  if (!validAddress(candidate)) throw new Error('Deployment finalized, but no contract address was returned. Check the explorer.');
  await verifyContract(candidate);
  saveAddress(candidate); state.contract = candidate; state.verified = true;
}

function openReview(title, detail, action, label) { state.modal = { title, detail, action, label }; render(); }

async function handleAction(action, target) {
  if (action === 'dismiss') { state.error = ''; state.notice = ''; render(); return; }
  if (action === 'connect') return connect();
  if (action === 'close-modal') { state.modal = null; render(); return; }
  if (action === 'use-address') {
    try { saveAddress(document.querySelector('#contract-address').value.trim()); state.contract = document.querySelector('#contract-address').value.trim(); await refresh(); }
    catch (error) { message(safeError(error), 'error'); }
    return;
  }
  if (action === 'review-deploy') {
    openReview('Deploy PatchProof to Studionet', 'Your connected wallet becomes the deployer. The contract accepts no GEN and has no administrator verdict controls.', 'confirm-deploy', 'Open MetaMask'); return;
  }
  if (action === 'confirm-deploy') {
    return perform('Contract deployment', () => deploy(state.account), finishDeployment);
  }
  if (action === 'review-evaluate') {
    const c = state.check;
    openReview('Run validator consensus', `Validators will fetch the two pinned sources and judge ${c.package_name} ${c.current_version} → ${c.target_version} against the declared usage.`, 'confirm-evaluate', 'Open MetaMask'); return;
  }
  if (action === 'confirm-evaluate') {
    const id = state.checkId;
    return perform('Release evaluation', () => write(state.contract, 'evaluate_check', [id], state.account), async () => {
      const record = await read(state.contract, 'get_check', [id]);
      if (record.status === 'PENDING') throw new Error('The confirmed transaction did not publish a verdict.');
    });
  }
  if (action === 'open-check') { setCheckId(target.dataset.id); await refresh(); document.querySelector('.result')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (action === 'copy-link') {
    await navigator.clipboard.writeText(checkLink(state.contract, state.checkId));
    message('Public check link copied.'); return;
  }
}

app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (target) handleAction(target.dataset.action, target);
});

app.addEventListener('change', event => {
  if (event.target.id === 'confirm-box') document.querySelector('#confirm-action').disabled = !event.target.checked;
});

app.addEventListener('submit', async event => {
  if (event.target.id !== 'check-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = {
    id: newId(), packageName: form.get('package').trim(), current: form.get('current').trim(),
    target: form.get('target').trim(), usage: form.get('usage').trim(),
    release: form.get('release').trim(), migration: form.get('migration').trim(),
  };
  if (payload.current === payload.target) return message('Current and target versions must differ.', 'error');
  state.draft = payload;
  openReview('Create this public release check', `${payload.packageName} ${payload.current} → ${payload.target}. The declared usage and both source URLs will be stored on Studionet.`, 'confirm-create', 'Open MetaMask');
});

const originalHandleAction = handleAction;
handleAction = async function patchedHandleAction(action, target) {
  if (action === 'confirm-create') {
    const d = state.draft;
    setCheckId(d.id);
    return perform('Check creation', () => write(state.contract, 'create_check', [d.id, d.packageName, d.current, d.target, d.usage, d.release, d.migration], state.account), async () => {
      const record = await read(state.contract, 'get_check', [d.id]);
      if (record.owner !== state.account.toLowerCase()) throw new Error('The created check could not be verified on-chain.');
    });
  }
  return originalHandleAction(action, target);
};

if (getProvider()) {
  getProvider().on?.('accountsChanged', accounts => { state.account = accounts?.[0] || ''; state.checks = []; refresh(); });
  getProvider().on?.('chainChanged', () => { state.account = ''; state.checks = []; render(); });
}

render();
refresh();
