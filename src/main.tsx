import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Bot, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Copy, Download, Gauge, Hash, Info, Menu, MessageSquare, Moon, Plus, RotateCcw, Send, Settings2, Sparkles, Square, Sun, Terminal, X, Zap } from 'lucide-react';
import './styles.css';

type Role = 'user' | 'assistant';
type ChatMessage = { id: string; role: Role; content: string; usage?: { input_tokens?: number; output_tokens?: number }; raw?: unknown; error?: string };
type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-5-5';
const models: { id: ModelId; label: string; caption: string; temperature: boolean }[] = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', caption: 'Fast & efficient', temperature: true },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', caption: 'Balanced', temperature: true },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', caption: 'Most capable', temperature: false }
];
const lengths = [
  { label: 'Very short', tokens: 100, hint: '50–100 tokens' },
  { label: 'Short', tokens: 300, hint: '~300 tokens' },
  { label: 'Medium', tokens: 600, hint: '~600 tokens' },
  { label: 'Long', tokens: 1000, hint: '~1,000 tokens' },
  { label: 'Very descriptive', tokens: 5000, hint: 'Up to 5,000 tokens' }
];
const facts = [
  'Octopuses have three hearts and blue blood.',
  'A day on Venus is longer than its year.',
  'Honey can stay edible for thousands of years when sealed.',
  'The first computer bug was an actual moth.',
  'Sharks existed before trees.'
];
const uid = () => crypto.randomUUID();
function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('nova-dark') === 'true');
  const [model, setModel] = useState<ModelId>('claude-haiku-4-5');
  const [length, setLength] = useState(600);
  const [temperature, setTemperature] = useState(0.5);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [inspector, setInspector] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'json'>('overview');
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [factIndex] = useState(() => Math.floor(Math.random() * facts.length));
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const currentModel = models.find(m => m.id === model)!;
  const latest = [...messages].reverse().find(m => m.role === 'assistant' && (m.raw || m.usage));
  const selected = messages.find(m => m.id === selectedMessage) ?? latest;
  const totalInput = messages.reduce((n, m) => n + (m.usage?.input_tokens || 0), 0);
  const totalOutput = messages.reduce((n, m) => n + (m.usage?.output_tokens || 0), 0);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('nova-dark', String(dark)); }, [dark]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: busy ? 'instant' : 'smooth' }); }, [messages, busy]);
  useEffect(() => { const click = (ev: MouseEvent) => { if (!modelRef.current?.contains(ev.target as Node)) setModelOpen(false); }; window.addEventListener('mousedown', click); return () => window.removeEventListener('mousedown', click); }, []);
  function reset() { abortRef.current?.abort(); setBusy(false); setMessages([]); setDraft(''); setSelectedMessage(null); setMobileSidebar(false); inputRef.current?.focus(); }
  function stop() { abortRef.current?.abort(); abortRef.current = null; setBusy(false); }
  function updateMessage(id: string, patch: Partial<ChatMessage>) { setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m)); }
  async function send(text = draft) {
    const prompt = text.trim(); if (!prompt || busy) return;
    const user: ChatMessage = { id: uid(), role: 'user', content: prompt };
    const responseId = uid();
    const assistant: ChatMessage = { id: responseId, role: 'assistant', content: '' };
    const history = [...messages, user].filter(m => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages(prev => [...prev, user, assistant]); setSelectedMessage(responseId); setDraft(''); setBusy(true);
    const controller = new AbortController(); abortRef.current = controller;
    const payload = { messages: history, model, maxTokens: length, temperature };
    try {
      if (!streamEnabled) {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        updateMessage(responseId, { content: (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''), usage: data.usage, raw: data });
      } else {
        const res = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!res.ok || !res.body) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `HTTP ${res.status}`); }
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = '', complete = false, answer = '', currentUsage: ChatMessage['usage'];
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const blocks = buffer.split('\n\n'); buffer = blocks.pop() || '';
          for (const block of blocks) {
            const name = block.match(/^event: (.+)$/m)?.[1]; const json = block.match(/^data: (.+)$/m)?.[1]; if (!json) continue;
            const payload = JSON.parse(json);
            if (name === 'text') { answer += payload.text; updateMessage(responseId, { content: answer }); }
            if (name === 'usage') { currentUsage = { ...currentUsage, ...payload }; updateMessage(responseId, { usage: currentUsage }); }
            if (name === 'complete') { complete = true; const message = payload.message; updateMessage(responseId, { content: (message.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') || answer, usage: message.usage, raw: message }); }
            if (name === 'error') throw new Error(payload.error || 'Stream failed.');
          }
        }
        if (!complete && !controller.signal.aborted) throw new Error('The stream ended before Claude completed its response.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') updateMessage(responseId, { error: err?.message || 'Something went wrong.' });
    } finally { if (abortRef.current === controller) abortRef.current = null; setBusy(false); }
  }
  function downloadJson() { if (!selected?.raw) return; const url = URL.createObjectURL(new Blob([JSON.stringify(selected.raw, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'nova-claude-response.json'; a.click(); URL.revokeObjectURL(url); }
  return <div className="app-shell">
    <header className="header">
      <div className="brand"><div className="brand-mark"><Sparkles size={21} strokeWidth={2.4}/></div><span>Nova<span className="brand-ai"> AI</span> <span className="brand-assistant">Assistant</span></span><span className="beta">BETA</span></div>
      <div className="header-actions"><div className="connection"><span className="status-dot"/> Claude API workspace</div><button className="icon-button theme-button" onClick={() => setDark(!dark)} title={dark ? 'Use light mode' : 'Use dark mode'}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button mobile-menu" onClick={() => setMobileSidebar(!mobileSidebar)} aria-label="Toggle settings"><Menu size={19}/></button></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${mobileSidebar ? 'mobile-visible' : ''}`}>
        <div className="sidebar-top"><span className="eyebrow">YOUR WORKSPACE</span><button className="new-chat" onClick={reset}><Plus size={17}/> New conversation <span>⌘ K</span></button></div>
        <div className="sidebar-scroll">
          <div className="section-heading"><Settings2 size={16}/><span>Model configuration</span></div>
          <div className="field-label">Claude model <Info size={13}/></div>
          <div className="model-wrap" ref={modelRef}><button className="model-select" onClick={() => setModelOpen(!modelOpen)}><div className="model-icon"><Sparkles size={17}/></div><div className="model-name"><strong>{currentModel.label}</strong><small>{currentModel.caption}</small></div><ChevronDown size={16} className={modelOpen ? 'rotate' : ''}/></button>
            {modelOpen && <div className="model-menu">{models.map(item => <button key={item.id} onClick={() => { setModel(item.id); setModelOpen(false); }} className={model === item.id ? 'chosen' : ''}><div><strong>{item.label}</strong><small>{item.caption}</small></div>{model === item.id && <Check size={16}/>}</button>)}</div>}
          </div>
          <div className="field-label spaced">Response length <span className="helper">Max output</span></div>
          <div className="length-grid">{lengths.map(item => <button key={item.tokens} className={`length-option ${length === item.tokens ? 'active' : ''}`} onClick={() => setLength(item.tokens)}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div>
          <div className="field-label spaced">Temperature <span className="temp-value">{currentModel.temperature ? temperature.toFixed(1) : 'N/A'}</span></div>
          <input className="temp-slider" type="range" min="0" max="1" step="0.1" value={temperature} disabled={!currentModel.temperature} style={{ '--progress': `${temperature * 100}%` } as React.CSSProperties} onChange={e => setTemperature(Number(e.target.value))} aria-label="Temperature" />
          <div className="slider-labels"><span>Precise</span><span>Creative</span></div>
          {!currentModel.temperature && <p className="notice"><Info size={14}/> Temperature isn't supported for Opus 5.5. It will be omitted from the API request.</p>}
          <div className="section-divider"/>
          <div className="section-heading"><Zap size={16}/><span>Preferences</span></div>
          <div className="toggle-row"><div><strong>Stream responses</strong><small>Show text as it's generated</small></div><button aria-label="Toggle streaming" aria-pressed={streamEnabled} className={`switch ${streamEnabled ? 'on' : ''}`} onClick={() => setStreamEnabled(!streamEnabled)}><span/></button></div>
          <div className="toggle-row"><div><strong>Response inspector</strong><small>Usage metrics & raw JSON</small></div><button aria-label="Toggle response inspector" aria-pressed={inspector} className={`switch ${inspector ? 'on' : ''}`} onClick={() => setInspector(!inspector)}><span/></button></div>
        </div>
        <div className="sidebar-bottom"><div className="tip-icon"><CircleHelp size={16}/></div><div><strong>Developer workspace</strong><p>Explore Claude responses, tokens, and model behavior.</p></div></div>
      </aside>
      <main className="main-area"><div className="chat-column">
        <div className="chat-top"><div className="conversation-title"><MessageSquare size={17}/><strong>Playground</strong><ChevronRight size={15}/><span>New conversation</span></div><button className="clear-button" onClick={reset}><RotateCcw size={14}/> Reset chat</button></div>
        <div className="chat-scroll">
          {messages.length === 0 ? <div className="empty-state"><div className="hero-icon"><Sparkles size={31}/></div><div className="hero-eyebrow">YOUR AI PLAYGROUND</div><h1>What's on your mind?</h1><p>Ask anything, experiment with Claude models, and explore every detail of the response — all in one place.</p><div className="suggestions"><button onClick={() => send('Explain how large language models work in simple terms.') }><span className="suggestion-icon violet"><Sparkles size={17}/></span><span><strong>Explain a concept</strong><small>How do language models work?</small></span><ArrowUp size={15}/></button><button onClick={() => send('Write a short TypeScript function that retries failed API requests with exponential backoff.') }><span className="suggestion-icon blue"><Code2 size={17}/></span><span><strong>Generate some code</strong><small>A helpful TypeScript utility</small></span><ArrowUp size={15}/></button><button onClick={() => send('Give me five creative ideas for a productivity app.') }><span className="suggestion-icon peach"><Zap size={17}/></span><span><strong>Brainstorm ideas</strong><small>Get inspired with Claude</small></span><ArrowUp size={15}/></button></div></div> : <div className="messages">{messages.map((m) => <div className={`message ${m.role}`} key={m.id}><div className="message-avatar">{m.role === 'assistant' ? <Sparkles size={18}/> : 'Y'}</div><div className="message-body"><div className="message-heading">{m.role === 'assistant' ? 'Nova AI' : 'You'} {m.role === 'assistant' && <span>· {currentModel.label}</span>}</div><div className="message-text">{m.content ? (m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content) : (busy && m === messages[messages.length - 1] ? <span className="thinking"><i/><i/><i/></span> : null)}{m.error && <div className="message-error">{m.error}</div>}</div>{m.role === 'assistant' && (m.usage || m.raw) && <button className="view-response" onClick={() => { setSelectedMessage(m.id); setInspector(true); setInspectorTab('overview'); }}><Hash size={13}/> {m.usage?.input_tokens ?? '—'} input · {m.usage?.output_tokens ?? '—'} output <ChevronRight size={13}/></button>}</div></div>)}</div>}
          <div ref={bottomRef}/>
        </div>
        <div className="composer-area"><div className="composer"><textarea ref={inputRef} rows={2} placeholder="Message Nova AI..." value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send(); } }} aria-label="Your message"/><div className="composer-bottom"><span><span className="tiny-model-dot"/>{currentModel.label} <span className="composer-sep">·</span> {length.toLocaleString()} max tokens</span>{busy ? <button className="send-button stop" onClick={stop} title="Stop generation"><Square size={15} fill="currentColor"/></button> : <button className="send-button" disabled={!draft.trim()} onClick={() => send()} title="Send message"><ArrowUp size={19}/></button>}</div></div><div className="composer-note">Claude can make mistakes. Verify important information. <span>Enter to send · Shift+Enter for a new line</span></div></div>
      </div></main>
      {inspector && <aside className="inspector"><div className="inspector-title"><div><Terminal size={18}/><strong>Response inspector</strong></div><button className="icon-button" onClick={() => setInspector(false)} title="Close inspector"><X size={17}/></button></div><div className="inspector-tabs"><button className={inspectorTab === 'overview' ? 'active' : ''} onClick={() => setInspectorTab('overview')}>Overview</button><button className={inspectorTab === 'json' ? 'active' : ''} onClick={() => setInspectorTab('json')}>Raw JSON</button></div>
        {inspectorTab === 'overview' ? <div className="inspector-content"><div className="metrics-head"><span>LAST RESPONSE</span><span className={selected?.raw ? 'complete' : 'awaiting'}>{selected?.raw ? '● Complete' : busy ? '● Generating' : '○ Awaiting request'}</span></div><div className="metric-cards"><div className="metric"><div className="metric-top"><span>Input tokens</span><ArrowUp className="input-arrow" size={15}/></div><strong>{selected?.usage?.input_tokens?.toLocaleString() ?? '—'}</strong><small>Tokens sent to model</small></div><div className="metric"><div className="metric-top"><span>Output tokens</span><ArrowUp className="output-arrow" size={15}/></div><strong>{selected?.usage?.output_tokens?.toLocaleString() ?? '—'}</strong><small>Tokens generated</small></div></div><div className="details-card"><h3>Request details</h3><div><span>Model</span><strong>{(selected?.raw as any)?.model || model}</strong></div><div><span>Max output tokens</span><strong>{length.toLocaleString()}</strong></div><div><span>Temperature</span><strong>{currentModel.temperature ? temperature.toFixed(1) : 'Not supported'}</strong></div><div><span>Streaming</span><strong>{streamEnabled ? 'Enabled' : 'Disabled'}</strong></div><div><span>Stop reason</span><strong>{(selected?.raw as any)?.stop_reason || '—'}</strong></div></div><div className="details-card"><h3>Session usage</h3><div><span>Total input tokens</span><strong>{totalInput.toLocaleString()}</strong></div><div><span>Total output tokens</span><strong>{totalOutput.toLocaleString()}</strong></div><div><span>Responses</span><strong>{messages.filter(m => m.role === 'assistant' && m.raw).length}</strong></div></div><div className="inspector-help"><Info size={15}/><span>Token usage is reported by Claude's API, not estimated from message text.</span></div></div> : <div className="json-panel"><div className="json-head"><span>API RESPONSE</span><div><button title="Copy JSON" disabled={!selected?.raw} onClick={() => navigator.clipboard.writeText(JSON.stringify(selected?.raw, null, 2))}><Copy size={14}/></button><button title="Download JSON" disabled={!selected?.raw} onClick={downloadJson}><Download size={14}/></button></div></div><pre>{selected?.raw ? JSON.stringify(selected.raw, null, 2) : '// Your complete API response will appear here after you send a message.'}</pre></div>}
        <div className="inspector-footer"><span className="live-dot"/> Live API metrics <span>·</span> Anthropic Messages API</div>
      </aside>}
    </div>
    <footer className="footer"><span><Sparkles size={13}/> DID YOU KNOW? <strong>{facts[factIndex]}</strong></span><span>Built with <span className="heart">♥</span> for curious minds <span className="footer-divider">·</span> Nova AI © 2026</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
