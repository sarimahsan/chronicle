import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, GitBranch, Key, Activity, Bot, User, Trash2, Send, 
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Info, RefreshCw,
  GitCommit, AlertCircle, FileCode, Users
} from 'lucide-react';

// Custom Markdown Formatter to render tables, bold, headers, code, lists, and click-to-view commit links
function Markdown({ text, onCommitClick }) {
  if (!text) return null;

  // Escape HTML to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Match and wrap commit hashes (e.g. 7-8 or 40 hex chars) before any tag injection so they don't break classnames
  html = html.replace(/\b([0-9a-f]{7,8}|[0-9a-f]{40})\b/gi, '<span class="cursor-pointer font-mono font-bold bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-blue-400 hover:text-blue-300 px-1 py-0.5 rounded transition inline-flex items-center gap-1" data-commit-hash="$1">#$1</span>');

  // Code blocks: ```lang ... ```
  html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, (_, code) => {
    return `<pre class="bg-slate-950 border border-slate-850 p-3 rounded-lg overflow-x-auto my-3 font-mono text-xs text-slate-300"><code>${code}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="bg-slate-900 border border-slate-800/60 text-slate-300 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>');

  // Bold: **bold**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>');

  // Italic: *italic*
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');

  // Headings: ###, ##, #
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-semibold text-slate-100 mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-base font-semibold text-slate-100 mt-5 mb-2.5">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-lg font-bold text-white mt-6 mb-3">$1</h1>');

  // Markdown Tables
  const tableRegex = /((?:\|[^\n]*\|(?:\n|$))+)/g;
  html = html.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 2) return match;
    
    let tableHtml = '<div class="overflow-x-auto my-4 border border-slate-850 rounded-lg"><table class="min-w-full divide-y divide-slate-850 text-xs text-left">';
    
    // Extract headers
    const headerRow = lines[0].split('|').map(cell => cell.trim()).filter((cell, i, arr) => i > 0 && i < arr.length - 1);
    tableHtml += '<thead class="bg-slate-900/50"><tr>';
    headerRow.forEach(header => {
      tableHtml += `<th class="px-4 py-2 font-medium text-slate-300">${header}</th>`;
    });
    tableHtml += '</tr></thead><tbody class="divide-y divide-slate-850/60 bg-transparent">';
    
    // Skip separator line (lines[1]) and parse rows
    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i].split('|').map(cell => cell.trim()).filter((cell, i, arr) => i > 0 && i < arr.length - 1);
      if (cells.length === 0) continue;
      tableHtml += '<tr class="hover:bg-slate-900/10 transition">';
      cells.forEach(cell => {
        tableHtml += `<td class="px-4 py-2 text-slate-400 font-normal">${cell}</td>`;
      });
      tableHtml += '</tr>';
    }
    
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li class="my-1.5">$1</li>');
  html = html.replace(/(<li class="my-1.5">.*?<\/li>)+/gs, '<ul class="list-disc pl-5 my-3 text-slate-300">$&</ul>');

  // Line breaks
  const lines = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('<h') || 
        trimmed.startsWith('<ul') || 
        trimmed.startsWith('</ul') || 
        trimmed.startsWith('<li') || 
        trimmed.startsWith('<div') || 
        trimmed.startsWith('</div') || 
        trimmed.startsWith('<table') || 
        trimmed.startsWith('</table') || 
        trimmed.startsWith('<thead') || 
        trimmed.startsWith('</thead') || 
        trimmed.startsWith('<tr') || 
        trimmed.startsWith('</tr') || 
        trimmed.startsWith('<td') || 
        trimmed.startsWith('<th') || 
        trimmed.startsWith('<pre') || 
        trimmed.startsWith('</pre') || 
        trimmed === '') {
      return line;
    }
    return `${line}<br/>`;
  });
  
  // Custom click handler wrapper for Event Delegation
  const handleWrapperClick = (e) => {
    const target = e.target.closest('[data-commit-hash]');
    if (target) {
      const hash = target.getAttribute('data-commit-hash');
      if (hash && onCommitClick) {
        onCommitClick(hash);
      }
    }
  };

  return <div onClick={handleWrapperClick} dangerouslySetInnerHTML={{ __html: lines.join('\n') }} />;
}

export default function App() {
  const [repoInput, setRepoInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryVal, setQueryVal] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' or 'insights'
  
  // App states
  const [repoSummary, setRepoSummary] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [toast, setToast] = useState(null);
  
  // Diff Modal states
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [activeDiff, setActiveDiff] = useState(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  // Initial check on load
  useEffect(() => {
    checkStatus();
    fetchRepositories();
  }, []);

  // Sync analytics load when summary becomes available
  useEffect(() => {
    if (repoSummary && repoSummary.total_commits > 0) {
      fetchAnalytics();
    } else {
      setAnalyticsData(null);
    }
  }, [repoSummary]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success' && data.summary && data.summary.total_commits > 0) {
        setRepoSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to get status', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setAnalyticsData(data.analytics);
      }
    } catch (err) {
      console.error('Failed to get analytics', err);
    }
  };

  const fetchRepositories = async () => {
    try {
      const res = await fetch('/api/repositories');
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setRepositories(data.repositories);
      }
    } catch (err) {
      console.error('Failed to fetch repositories', err);
    }
  };

  const handleSelectRepository = async (repoPath) => {
    if (!repoPath) return;
    setIsIngesting(true);
    showToast('Switching active repository...', 'info');
    try {
      const res = await fetch('/api/repositories/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_path: repoPath })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Switching repository failed');
      }
      showToast(data.message, 'success');
      setRepoSummary(data.summary);
      setMessages([]);
      fetchRepositories();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!repoInput.trim()) {
      showToast('Please enter a repository path or Git URL.', 'error');
      return;
    }

    setIsIngesting(true);
    showToast('Analyzing repository commits. Connecting to database...', 'info');

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path_or_url: repoInput.trim(),
          token: tokenInput.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Ingestion failed');
      }

      showToast(data.message, 'success');
      setRepoSummary(data.summary);
      fetchRepositories();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleQuery = async (question) => {
    if (!question.trim() || isQuerying) return;
    
    // Add user message
    const userMsg = { text: question, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsQuerying(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Query failed');
      }

      setMessages(prev => [...prev, { text: data.answer, sender: 'bot', timestamp: new Date() }]);
    } catch (err) {
      setMessages(prev => [...prev, { text: `Query failed: ${err.message}`, sender: 'bot', isError: true, timestamp: new Date() }]);
      showToast(err.message, 'error');
    } finally {
      setIsQuerying(false);
    }
  };

  const openCommitDiff = async (hash) => {
    setIsDiffLoading(true);
    setDiffModalOpen(true);
    try {
      const res = await fetch(`/api/commit/${hash}/diff`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to retrieve commit patch');
      }
      setActiveDiff(data.diff);
    } catch (err) {
      showToast(err.message, 'error');
      setDiffModalOpen(false);
    } finally {
      setIsDiffLoading(false);
    }
  };

  const submitQueryForm = (e) => {
    e.preventDefault();
    const q = queryVal;
    setQueryVal('');
    handleQuery(q);
  };

  const clearChat = () => {
    setMessages([]);
    showToast('Chat history cleared.', 'info');
  };

  // Clickable Shortcuts
  const clickFileShortcut = (file) => {
    handleQuery(`Analyze changes and history of file: ${file}`);
  };

  const clickAuthorShortcut = (author) => {
    handleQuery(`Summarize contributions, focus, and file history for author: ${author}`);
  };

  const clickBusFactorShortcut = (file, author) => {
    handleQuery(`Analyze knowledge risk on file '${file}'. It was only modified by '${author}'. What did they change?`);
  };

  // Status variables
  const isLoaded = !!(repoSummary && repoSummary.total_commits > 0);
  const isGraphConnected = repoSummary?.graph_status === 'Saved to Graph';

  const suggestedQueries = [
    'Who authored the initial commits?',
    'What files are changed the most?',
    'Who touches the files the most?',
    'Summarize the latest changes in the repo'
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0c10] text-slate-100 selection:bg-slate-800 selection:text-white">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl border shadow-2xl animate-fade-in-up duration-300 max-w-sm bg-slate-900 backdrop-blur-md ${
          toast.type === 'error' ? 'border-red-950/60 text-red-200' :
          toast.type === 'success' ? 'border-emerald-950/60 text-emerald-200' :
          'border-slate-800/80 text-slate-200'
        }`}>
          {toast.type === 'error' && <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />}
          {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
          {toast.type === 'info' && <Info className="h-5 w-5 text-blue-400 shrink-0" />}
          <span className="text-xs font-medium tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Diff Inspection Modal */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-[#0a0c10] border border-slate-900 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            {isDiffLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
                <RefreshCw className="h-8 w-8 text-slate-600 animate-spin" />
                <p className="text-xs text-slate-500 font-medium">Extracting git diff patch...</p>
              </div>
            ) : activeDiff ? (
              <>
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-900 flex justify-between items-start shrink-0 bg-slate-950/60 backdrop-blur">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1"><GitCommit className="h-3 w-3" /> Commit details</span>
                      <span className="font-mono text-xs font-bold text-blue-400 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">{activeDiff.hash.substring(0, 8)}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug">{activeDiff.message}</h3>
                    <p className="text-[11px] text-slate-400">
                      Authored by <span className="font-semibold text-slate-200 hover:underline cursor-pointer" onClick={() => { setDiffModalOpen(false); clickAuthorShortcut(activeDiff.author); }}>{activeDiff.author}</span> &lt;{activeDiff.email}&gt; on {new Date(activeDiff.date).toLocaleString()}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setDiffModalOpen(false); setActiveDiff(null); }}
                    className="text-slate-400 hover:text-white text-xs font-semibold bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl hover:bg-slate-850 transition"
                  >
                    Close
                  </button>
                </div>
                {/* Modal Body (Diff list) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {activeDiff.diffs && activeDiff.diffs.length > 0 ? (
                    activeDiff.diffs.map((d, idx) => (
                      <div key={idx} className="border border-slate-900 rounded-xl overflow-hidden bg-slate-950/20">
                        <div className="bg-slate-950/80 px-4 py-2.5 text-xs border-b border-slate-900/60 flex justify-between items-center">
                          <span className="font-mono text-slate-300 font-semibold cursor-pointer hover:underline" onClick={() => { setDiffModalOpen(false); clickFileShortcut(d.file); }}>{d.file}</span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            d.change_type === 'A' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' :
                            d.change_type === 'D' ? 'bg-red-950/40 text-red-400 border border-red-900/40' :
                            'bg-blue-950/40 text-blue-400 border border-blue-900/40'
                          }`}>
                            {d.change_type === 'A' ? 'Added' : d.change_type === 'D' ? 'Deleted' : 'Modified'}
                          </span>
                        </div>
                        <pre className="p-4 text-xs font-mono overflow-x-auto text-slate-400 bg-black/40 leading-relaxed max-h-[350px]">
                          <code>{d.patch || '[No patch file content changes]'}</code>
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-slate-500 text-xs font-medium">No diff changes found in this commit.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-slate-500 text-xs">Failed to load diff content.</div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar Panel */}
      <aside className={`glass-panel z-30 flex h-full flex-col transition-all duration-300 border-r ${
        sidebarOpen ? 'w-[340px] p-6 translate-x-0' : 'w-0 p-0 -translate-x-full overflow-hidden border-r-0'
      } shrink-0`}>
        
        {/* Title area */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-950 shadow-md">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-white">Chronicle</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Repo Intelligence</p>
          </div>
        </div>

        {/* Repository Selector Dropdown */}
        {repositories.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-5 pb-5 border-b border-slate-900 shrink-0">
            <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Active Repository</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <select
                  value={repoSummary?.repo_path || ''}
                  onChange={(e) => handleSelectRepository(e.target.value)}
                  className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl py-2.5 pl-3.5 pr-8 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 focus:bg-slate-950/80 transition cursor-pointer appearance-none"
                >
                  {repositories.map((repo) => (
                    <option key={repo.repo_path} value={repo.repo_path} className="bg-slate-950 text-slate-100">
                      {repo.repo_name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <ChevronRight className="h-4 w-4 rotate-90" />
                </div>
              </div>
              <button 
                type="button"
                onClick={() => handleSelectRepository(repoSummary?.repo_path)}
                disabled={isIngesting}
                title="Sync / Pull latest commits"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-300 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isIngesting ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* Form panel */}
        <form onSubmit={handleIngest} className="flex flex-col gap-3.5 mb-5 pb-5 border-b border-slate-900 shrink-0">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Workspace / Git URL</label>
            <div className="relative flex items-center">
              <GitBranch className="absolute left-3.5 h-4 w-4 text-slate-500" />
              <input 
                type="text" 
                value={repoInput} 
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="e:\Chronicle or Github URL" 
                className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 focus:bg-slate-950/80 transition"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">PAT Token (Optional)</label>
            <div className="relative flex items-center">
              <Key className="absolute left-3.5 h-4 w-4 text-slate-500" />
              <input 
                type="password" 
                value={tokenInput} 
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Personal access token" 
                className="w-full bg-slate-950/40 border border-slate-800/60 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500 focus:bg-slate-950/80 transition"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isIngesting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-100 to-white hover:from-white hover:to-white text-slate-950 font-bold py-2.5 text-xs transition-all shadow-md hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isIngesting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>Ingest Repository</span>
            )}
          </button>
        </form>

        {/* Tab switch navigation (Overview vs Insights) */}
        {isLoaded && (
          <div className="flex gap-4 border-b border-slate-900 mb-4 pb-2.5 shrink-0">
            <button 
              onClick={() => setActiveTab('summary')}
              className={`text-[10px] font-bold tracking-wider uppercase pb-1 border-b-2 transition ${
                activeTab === 'summary' ? 'border-white text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('insights')}
              className={`text-[10px] font-bold tracking-wider uppercase pb-1 border-b-2 transition ${
                activeTab === 'insights' ? 'border-white text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Dev Insights
            </button>
          </div>
        )}

        {/* Dynamic Tab Body */}
        <div className="flex-1 overflow-y-auto space-y-5">
          {!isLoaded ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-16">
              <Activity className="h-6 w-6 text-slate-700 mb-2.5 animate-pulse" />
              <p className="text-xs text-slate-500 font-medium">No repository ingested. Insert a path or url to view statistics.</p>
            </div>
          ) : activeTab === 'summary' ? (
            /* Tab: Summary Overview */
            <>
              {/* Connected details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-slate-500" />
                    Status
                  </h2>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide ${
                    isGraphConnected 
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' 
                      : 'bg-red-950/40 text-red-400 border border-red-900/50'
                  }`}>
                    {isGraphConnected ? 'Graph Online' : 'Graph Offline'}
                  </span>
                </div>

                <div className="bg-slate-950/40 border border-slate-900/85 rounded-xl p-3 space-y-2.5">
                  <div className="flex justify-between text-xs border-b border-slate-900/50 pb-2">
                    <span className="text-slate-500">Active Repo:</span>
                    <span className="font-semibold text-slate-200 max-w-[150px] truncate">{repoSummary.repo_name}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-900/50 pb-2">
                    <span className="text-slate-500">Commits Count:</span>
                    <span className="font-semibold text-slate-200">{repoSummary.total_commits}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-900/50 pb-2">
                    <span className="text-slate-500">Total Authors:</span>
                    <span className="font-semibold text-slate-200">{repoSummary.total_authors}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Unique Files:</span>
                    <span className="font-semibold text-slate-200">{repoSummary.unique_files_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* Contributors */}
              <div className="space-y-2.5">
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1"><Users className="h-3 w-3" /> Contributors</h3>
                <ul className="space-y-1.5">
                  {repoSummary.top_authors?.map((item, idx) => (
                    <li 
                      key={idx} 
                      onClick={() => clickAuthorShortcut(item.author)}
                      className="flex justify-between items-center text-xs bg-slate-950/20 border border-slate-900/60 p-2 rounded-lg cursor-pointer hover:bg-slate-900/30 hover:border-slate-800/80 transition-all"
                    >
                      <span className="text-slate-300 font-medium truncate max-w-[160px]">{item.author}</span>
                      <span className="text-[10px] text-slate-500 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-900">{item.count} commits</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Top files */}
              <div className="space-y-2.5">
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1"><FileCode className="h-3 w-3" /> Most Modified Files</h3>
                <ul className="space-y-1.5">
                  {repoSummary.top_files?.map((item, idx) => (
                    <li 
                      key={idx} 
                      onClick={() => clickFileShortcut(item.file)}
                      className="flex justify-between items-center text-[11px] bg-slate-950/20 border border-slate-900/60 p-2 rounded-lg cursor-pointer hover:bg-slate-900/30 hover:border-slate-800/80 transition-all"
                    >
                      <span className="font-mono text-slate-400 truncate max-w-[185px] direction-rtl text-left" title={item.file}>{item.file}</span>
                      <span className="text-[9px] text-slate-200 font-bold bg-slate-950/60 border border-slate-800 px-1.5 py-0.5 rounded">{item.changes}x</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            /* Tab: Dev Insights (SaaS / Code Health Analytics) */
            <div className="space-y-5">
              {!analyticsData ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <RefreshCw className="h-5 w-5 text-slate-700 animate-spin" />
                  <p className="text-[11px] text-slate-500 font-medium">Analyzing file churn...</p>
                </div>
              ) : (
                <>
                  {/* File Churn */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                        <Activity className="h-3 w-3 text-red-500/80" /> Code Churn Impact
                      </h3>
                      <span className="text-[9px] text-slate-500 font-semibold">(lines changed)</span>
                    </div>
                    <ul className="space-y-1.5">
                      {analyticsData.churn?.slice(0, 6).map((item, idx) => (
                        <li 
                          key={idx}
                          onClick={() => clickFileShortcut(item.file)}
                          className="flex flex-col gap-1 text-[11px] bg-slate-950/20 border border-slate-900/60 p-2.5 rounded-lg cursor-pointer hover:bg-slate-900/30 hover:border-slate-800/80 transition-all"
                        >
                          <span className="font-mono text-slate-300 truncate max-w-[280px] direction-rtl text-left" title={item.file}>{item.file}</span>
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Modifications: <strong className="text-slate-400">{item.commits_count}</strong></span>
                            <span className="text-slate-400">+{item.insertions} / -{item.deletions}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Single-Author Risk */}
                  <div className="space-y-2.5">
                    <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1 text-amber-500/90">
                      <AlertCircle className="h-3 w-3" /> Single-Author Silos
                    </h3>
                    {analyticsData.bus_factor_risk && analyticsData.bus_factor_risk.length > 0 ? (
                      <ul className="space-y-1.5">
                        {analyticsData.bus_factor_risk.slice(0, 6).map((item, idx) => (
                          <li 
                            key={idx}
                            onClick={() => clickBusFactorShortcut(item.file, item.authors[0])}
                            className="flex flex-col gap-1 text-[11px] bg-amber-950/5 border border-amber-900/20 p-2.5 rounded-lg cursor-pointer hover:bg-amber-950/10 hover:border-amber-900/40 transition-all"
                          >
                            <span className="font-mono text-amber-200/90 truncate max-w-[280px] direction-rtl text-left" title={item.file}>{item.file}</span>
                            <div className="flex justify-between text-[10px] text-amber-500/60">
                              <span>Only Author: <strong className="text-amber-400/80 font-medium">{item.authors[0]}</strong></span>
                              <span>{item.commits_count} edits</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="bg-slate-950/10 border border-slate-900/60 p-4 rounded-xl text-center text-slate-500 text-[11px]">
                        No single-author knowledge silos detected.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat layout */}
      <main className="flex-1 flex flex-col h-full bg-slate-950/20 relative">
        
        {/* Chat header */}
        <header className="h-[64px] border-b border-slate-900 flex items-center justify-between px-6 backdrop-blur bg-slate-950/30 shrink-0">
          <div className="flex items-center gap-3.5">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-850 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition shrink-0"
              title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            >
              {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-white">Workspace Intelligence</h2>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5 max-w-sm truncate md:max-w-md">
                {isLoaded ? `Ingested: ${repoSummary.repo_name} (${repoSummary.repo_path || 'local'})` : 'Please configure a repository connection'}
              </p>
            </div>
          </div>
          <div>
            <button 
              onClick={clearChat}
              disabled={messages.length === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-900 bg-slate-950/50 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition" 
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Chat message panel */}
        <div className="flex-1 overflow-y-auto px-8 py-10 space-y-6">
          {messages.length === 0 ? (
            /* Welcome Panel */
            <div className="max-w-2xl mx-auto mt-12 space-y-8 animate-fade-in duration-500">
              <div className="bg-[#0f1118]/80 border border-slate-900 rounded-2xl p-8 space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-white">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-white tracking-tight">Ask anything about repository logs</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Chronicle has access to full commit details, authorship statistics, and files. When Neo4j is connected, it uses **Text-to-Cypher** to run complex graph queries across relationships.
                  </p>
                </div>
              </div>

              {/* Suggestions grid */}
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Suggested queries</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {suggestedQueries.map((query, idx) => (
                    <button 
                      key={idx}
                      onClick={() => handleQuery(query)}
                      disabled={!isLoaded || isQuerying}
                      className="text-left bg-[#0f1118]/40 border border-slate-900 hover:border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-40 disabled:cursor-not-allowed glass-panel-hover"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Messages list */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'bot' && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-800/80 text-white shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  
                  <div className={`p-4 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tr-none shadow-md font-normal' 
                      : msg.isError 
                      ? 'bg-red-950/10 border border-red-900/30 text-red-200 rounded-tl-none' 
                      : 'bg-slate-900/40 border border-slate-900/80 text-slate-300 rounded-tl-none font-normal'
                  }`}>
                    {msg.sender === 'user' ? (
                      <p>{msg.text}</p>
                    ) : (
                      <Markdown text={msg.text} onCommitClick={openCommitDiff} />
                    )}
                  </div>

                  {msg.sender === 'user' && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950 font-bold shrink-0 text-xs shadow-md">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {/* Bot loading indicator */}
              {isQuerying && (
                <div className="flex gap-4 justify-start">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-800/80 text-white shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-[#0f1118]/50 border border-slate-900 p-4 rounded-2xl rounded-tl-none">
                    <div className="flex gap-1 items-center py-1 px-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce duration-500"></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce duration-500 delay-150"></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce duration-500 delay-300"></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <footer className="p-6 border-t border-slate-900/80 bg-slate-950/30 shrink-0">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={submitQueryForm} className="relative flex items-center">
              <input 
                type="text"
                value={queryVal}
                onChange={(e) => setQueryVal(e.target.value)}
                disabled={!isLoaded || isQuerying}
                placeholder={isLoaded ? "Ask a question about the repository..." : "Ingest a repository to start chatting"}
                className="w-full bg-[#0f1118]/60 border border-slate-900/80 rounded-2xl py-3.5 pl-5 pr-14 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-700 focus:bg-[#0f1118]/90 transition-all"
              />
              <button 
                type="submit"
                disabled={!isLoaded || isQuerying || !queryVal.trim()}
                className="absolute right-2 h-9 w-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-white text-slate-950 disabled:opacity-20 disabled:hover:bg-slate-100 disabled:cursor-not-allowed transition-all shadow"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </footer>

      </main>

    </div>
  );
}
