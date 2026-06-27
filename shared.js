/* =====================================================================
   shared.js — usado por todas as páginas (index.html + páginas de setor)
   ===================================================================== */

/* ===================== Helpers básicos ===================== */
function v(id, fallback=''){
  const el = document.getElementById(id);
  if(!el) return fallback;
  return (el.value || '').trim();
}
function nz(val, fallback='—'){
  return (val === '' || val === undefined || val === null) ? fallback : val;
}
function formatarData(iso){
  if(!iso) return '';
  const [ano,mes,dia] = iso.split('-');
  if(!dia) return iso;
  return `${dia}/${mes}/${ano}`;
}
function tickClock(elId='clock'){
  const el = document.getElementById(elId);
  if(el) el.textContent = new Date().toLocaleTimeString('pt-BR');
}
function flashButton(id, tempText){
  const btn = document.getElementById(id);
  if(!btn) return;
  const original = btn.textContent;
  btn.textContent = tempText;
  setTimeout(()=>{ btn.textContent = original; }, 2200);
}

/* ===================== Listas dinâmicas (campos repetíveis) ===================== */
function addRow(containerId, fields, values={}){
  const container = document.getElementById(containerId);
  if(!container) return;
  const row = document.createElement('div');
  row.className = 'dyn-row';
  fields.forEach(f=>{
    const input = document.createElement('input');
    input.type = f.type || 'text';
    input.placeholder = f.placeholder || '';
    input.dataset.key = f.key;
    if(values[f.key]) input.value = values[f.key];
    row.appendChild(input);
  });
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'row-remove';
  removeBtn.innerHTML = '✕';
  removeBtn.onclick = () => { row.remove(); document.dispatchEvent(new Event('dynlist-change')); };
  row.appendChild(removeBtn);
  container.appendChild(row);
  document.dispatchEvent(new Event('dynlist-change'));
}

function rows(containerId, keys){
  const container = document.getElementById(containerId);
  const items = [];
  if(!container) return items;
  container.querySelectorAll('.dyn-row').forEach(row=>{
    if(keys.length === 1){
      const input = row.querySelector('input');
      const value = input ? input.value.trim() : '';
      if(value) items.push(value);
    } else {
      const obj = {};
      let hasValue = false;
      keys.forEach(k=>{
        const input = row.querySelector(`[data-key="${k}"]`);
        const value = input ? input.value.trim() : '';
        obj[k] = value;
        if(value) hasValue = true;
      });
      if(hasValue) items.push(obj);
    }
  });
  return items;
}

function listBlock(items, emptyText){
  if(!items.length) return `   └ ${emptyText}`;
  return items.map(i => `   └ ${i}`).join('\n');
}
function bulletBlock(items, emptyText){
  if(!items.length) return `▸ ${emptyText}`;
  return items.map(i => `▸ ${i}`).join('\n');
}

/* ===================== Configuração do GitHub (compartilhada via localStorage) ===================== */
const GITHUB_API = 'https://api.github.com';

function utf8ToBase64(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function ghHeaders(token){
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}
function getGithubSettings(){
  const repoFull = (localStorage.getItem('pt_gh_repo') || '').trim();
  const branch = (localStorage.getItem('pt_gh_branch') || 'main').trim();
  const token = (localStorage.getItem('pt_gh_token') || '').trim();
  const [owner, repo] = repoFull.split('/').map(s => (s || '').trim());
  return { owner, repo, branch, token, repoFull };
}
function ghConfigured(){
  const s = getGithubSettings();
  return !!(s.owner && s.repo && s.token);
}

/* Liga os 3 campos (#ghRepo, #ghBranch, #ghToken) presentes no topo de cada
   página ao localStorage, para que o repositório/token configurado em uma
   página valha em todas as outras (mesmo navegador). */
function initGithubSettingsUI(){
  const repoEl = document.getElementById('ghRepo');
  const branchEl = document.getElementById('ghBranch');
  const tokenEl = document.getElementById('ghToken');
  if(!repoEl || !branchEl || !tokenEl) return;
  repoEl.value = localStorage.getItem('pt_gh_repo') || '';
  branchEl.value = localStorage.getItem('pt_gh_branch') || 'main';
  tokenEl.value = localStorage.getItem('pt_gh_token') || '';
  repoEl.addEventListener('change', e => localStorage.setItem('pt_gh_repo', e.target.value.trim()));
  branchEl.addEventListener('change', e => localStorage.setItem('pt_gh_branch', e.target.value.trim()));
  tokenEl.addEventListener('change', e => localStorage.setItem('pt_gh_token', e.target.value.trim()));
}

async function ghGetFileSha(owner, repo, path, branch, token){
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if(res.status === 404) return null;
  if(!res.ok) throw new Error(`Não foi possível consultar ${path} (HTTP ${res.status})`);
  const data = await res.json();
  return data.sha;
}

async function ghPutJsonFile(owner, repo, path, branch, token, contentObj, message){
  const sha = await ghGetFileSha(owner, repo, path, branch, token);
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(contentObj, null, 2)),
    branch
  };
  if(sha) body.sha = sha;
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ao salvar ${path} (HTTP ${res.status})`);
  }
  return res.json();
}

async function ghGetJsonFile(owner, repo, path, branch, token){
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if(res.status === 404) return null;
  if(!res.ok) throw new Error(`Erro ao buscar ${path} (HTTP ${res.status})`);
  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return JSON.parse(decoded);
}

async function ghDispatchWorkflow(owner, repo, branch, token, workflowFile = 'enviar-email.yml'){
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: branch })
  });
  if(!res.ok){
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Erro ao disparar o workflow (HTTP ${res.status})`);
  }
  return true;
}

function setStatus(elId, msg, isError=false){
  const el = document.getElementById(elId);
  if(!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--text-dim)';
}

/* ===================== Lógica genérica de página de setor ===================== */
/*
 * Cada página de setor (inbound.html, sorting.html, outbound.html, geral.html)
 * define um objeto assim:
 *
 * const SECTOR = {
 *   path: 'data/inbound.json',          // arquivo no repositório
 *   label: 'Inbound',                   // nome usado nas mensagens
 *   fields: ['veiculosRecebidos', ...], // ids dos inputs simples
 *   lists: {                            // listas dinâmicas
 *     'list-ageCritico': [{key:'value', placeholder:'Rua/Endereço'}]
 *   }
 * };
 *
 * E então chama initSectorPage(SECTOR) no DOMContentLoaded.
 * Cada setor SÓ lê/escreve o próprio arquivo — sem conflito entre setores.
 */

function serializeSector(SECTOR){
  const fields = {};
  SECTOR.fields.forEach(id=>{ fields[id] = v(id); });
  const lists = {};
  Object.entries(SECTOR.lists || {}).forEach(([containerId, fieldDefs])=>{
    const keys = fieldDefs.map(f => f.key);
    lists[containerId] = rows(containerId, keys);
  });
  return { fields, lists, salvoEm: new Date().toISOString() };
}

function applySector(SECTOR, state){
  if(!state) return;
  if(state.fields){
    Object.entries(state.fields).forEach(([id, val])=>{
      const el = document.getElementById(id);
      if(el) el.value = val;
    });
  }
  Object.entries(SECTOR.lists || {}).forEach(([containerId, fieldDefs])=>{
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    const keys = fieldDefs.map(f => f.key);
    const items = (state.lists && state.lists[containerId]) || [];
    if(items.length === 0){
      addRow(containerId, fieldDefs);
    } else {
      items.forEach(item=>{
        const values = keys.length === 1 ? { [keys[0]]: item } : item;
        addRow(containerId, fieldDefs, values);
      });
    }
  });
}

function initSectorDefaultRows(SECTOR){
  Object.entries(SECTOR.lists || {}).forEach(([containerId, fieldDefs])=>{
    addRow(containerId, fieldDefs);
  });
}

async function salvarSetorNoGithub(SECTOR, statusElId){
  if(!ghConfigured()){
    setStatus(statusElId, 'Configure o repositório e o token no topo da página antes de salvar.', true);
    return false;
  }
  const { owner, repo, branch, token } = getGithubSettings();
  const state = serializeSector(SECTOR);
  setStatus(statusElId, 'Salvando no GitHub...');
  try{
    await ghPutJsonFile(owner, repo, SECTOR.path, branch, token, state,
      `Atualiza setor ${SECTOR.label} da passagem de turno`);
    setStatus(statusElId, 'Salvo às ' + new Date().toLocaleTimeString('pt-BR') + ' ✓');
    return true;
  }catch(e){
    setStatus(statusElId, 'Erro ao salvar: ' + e.message, true);
    return false;
  }
}

async function carregarSetorDoGithub(SECTOR, statusElId){
  if(!ghConfigured()){
    setStatus(statusElId, 'Configure o repositório e o token no topo da página antes de restaurar.', true);
    return;
  }
  const { owner, repo, branch, token } = getGithubSettings();
  setStatus(statusElId, 'Carregando dados salvos...');
  try{
    const state = await ghGetJsonFile(owner, repo, SECTOR.path, branch, token);
    if(state){
      applySector(SECTOR, state);
      const quando = state.salvoEm ? new Date(state.salvoEm).toLocaleString('pt-BR') : '—';
      setStatus(statusElId, 'Dados restaurados (salvos em ' + quando + ')');
    } else {
      initSectorDefaultRows(SECTOR);
      setStatus(statusElId, 'Nenhum dado salvo ainda para este setor neste repositório.');
    }
  }catch(e){
    initSectorDefaultRows(SECTOR);
    setStatus(statusElId, 'Falha ao restaurar: ' + e.message, true);
  }
}

function limparSetor(SECTOR, statusElId){
  if(!confirm('Limpar todos os campos deste setor? Esta ação não pode ser desfeita aqui (mas só é salva no GitHub quando você clicar em Salvar).')) return;
  SECTOR.fields.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  Object.entries(SECTOR.lists || {}).forEach(([containerId])=>{
    const container = document.getElementById(containerId);
    if(container) container.innerHTML = '';
  });
  initSectorDefaultRows(SECTOR);
  setStatus(statusElId, 'Campos limpos localmente. Clique em "Salvar" para confirmar.', true);
}

let autoSaveTimer = null;
function agendarAutoSave(SECTOR, statusElId){
  if(!ghConfigured()) return;
  clearTimeout(autoSaveTimer);
  setStatus(statusElId, 'Alterações pendentes — salvando em alguns segundos...');
  autoSaveTimer = setTimeout(() => salvarSetorNoGithub(SECTOR, statusElId), 4000);
}

function initSectorPage(SECTOR, statusElId = 'setorStatus'){
  initGithubSettingsUI();
  initSectorDefaultRows(SECTOR);
  tickClock();
  setInterval(tickClock, 1000);

  if(ghConfigured()){
    carregarSetorDoGithub(SECTOR, statusElId);
  } else {
    setStatus(statusElId, 'Preencha o repositório e o token acima para sincronizar este setor.', true);
  }

  const form = document.querySelector('.form-col') || document.body;
  const onChange = (e)=>{
    if(e.target.classList && (e.target.classList.contains('shift-field') || e.target.closest('.dyn-row'))){
      agendarAutoSave(SECTOR, statusElId);
    }
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  document.addEventListener('dynlist-change', () => agendarAutoSave(SECTOR, statusElId));
}
