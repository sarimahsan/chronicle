// API Configuration
const API_BASE = window.location.origin;

// DOM Elements
const repoInput = document.getElementById('repo-input');
const tokenInput = document.getElementById('token-input');
const ingestBtn = document.getElementById('ingest-btn');
const queryInput = document.getElementById('query-input');
const sendBtn = document.getElementById('send-btn');
const chatForm = document.getElementById('chat-form');
const chatMessages = document.getElementById('chat-messages');
const statusPanel = document.getElementById('status-panel');
const clearChatBtn = document.getElementById('clear-chat-btn');
const activeRepoIndicator = document.getElementById('active-repo-indicator');

// Status Metadata Elements
const metaName = document.getElementById('meta-name');
const metaCommits = document.getElementById('meta-commits');
const metaAuthors = document.getElementById('meta-authors');
const metaFiles = document.getElementById('meta-files');
const metaContributors = document.getElementById('meta-contributors');
const metaFilesList = document.getElementById('meta-files-list');

// Suggested Query Buttons
const suggestionBtns = document.querySelectorAll('.query-suggestion-btn');

// App State
let isIngesting = false;
let isQuerying = false;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();
    
    // Check if a repository is already loaded
    checkRepoStatus();
    
    // Set up Event Listeners
    ingestBtn.addEventListener('click', handleIngest);
    chatForm.addEventListener('submit', handleQuerySubmit);
    clearChatBtn.addEventListener('click', clearChat);
    
    // Connect suggestion buttons
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isQuerying) return;
            const question = e.target.textContent;
            queryInput.value = question;
            handleQuery(question);
        });
    });
});

// Toast System
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMsg.textContent = message;
    toast.className = `toast ${type}`;
    
    // Update Lucide Icon based on type
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    
    toastIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();
    
    toast.classList.remove('hidden');
    
    // Auto hide after 4 seconds
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// Ingestion status check
async function checkRepoStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.status === 'success' && data.summary && data.summary.total_commits > 0) {
            updateUIWithSummary(data.summary);
            enableChat();
        }
    } catch (err) {
        console.error("Error checking repo status:", err);
    }
}

// Ingestion Action
async function handleIngest() {
    const repoPath = repoInput.value.trim();
    const token = tokenInput.value.trim();
    
    if (!repoPath) {
        showToast("Please enter a repository path or URL", "error");
        return;
    }
    
    setIngestingState(true);
    showToast("Analyzing and ingesting repository commits. This might take a few moments...", "info");
    
    try {
        const response = await fetch(`${API_BASE}/api/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repo_path_or_url: repoPath,
                token: token || null
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || "Failed to ingest repository");
        }
        
        showToast(data.message || "Repository successfully ingested!", "success");
        updateUIWithSummary(data.summary);
        enableChat();
        
    } catch (err) {
        showToast(err.message || "Error ingesting repository", "error");
    } finally {
        setIngestingState(false);
    }
}

// Set Loading state for ingestion button
function setIngestingState(loading) {
    isIngesting = loading;
    if (loading) {
        ingestBtn.disabled = true;
        ingestBtn.innerHTML = `<span class="loading-bubble"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></span>`;
    } else {
        ingestBtn.disabled = false;
        ingestBtn.innerHTML = `<i data-lucide="database-backup"></i><span>Ingest Repository</span>`;
        lucide.createIcons();
    }
}

// Enable chat input & features
function enableChat() {
    queryInput.disabled = false;
    sendBtn.disabled = false;
    suggestionBtns.forEach(btn => {
        btn.disabled = false;
    });
}

// Update UI with statistical metadata
function updateUIWithSummary(summary) {
    activeRepoIndicator.textContent = `Active Repository: ${summary.repo_name} (${summary.repo_path || 'local'})`;
    
    metaName.textContent = summary.repo_name;
    metaCommits.textContent = summary.total_commits;
    metaAuthors.textContent = summary.total_authors;
    metaFiles.textContent = summary.unique_files_count || 0;
    
    // Render top authors
    metaContributors.innerHTML = '';
    if (summary.top_authors && summary.top_authors.length > 0) {
        summary.top_authors.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="name">${item.author}</span><span class="count">${item.count} commits</span>`;
            metaContributors.appendChild(li);
        });
    } else {
        metaContributors.innerHTML = '<li>No contributors found</li>';
    }
    
    // Render top files
    metaFilesList.innerHTML = '';
    if (summary.top_files && summary.top_files.length > 0) {
        summary.top_files.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="file-name" title="${item.file}">${item.file}</span><span class="changes">${item.changes}x</span>`;
            metaFilesList.appendChild(li);
        });
    } else {
        metaFilesList.innerHTML = '<li>No files tracked</li>';
    }
    
    statusPanel.classList.remove('hidden');
}

// Submit chat queries
function handleQuerySubmit(e) {
    e.preventDefault();
    if (isQuerying) return;
    
    const question = queryInput.value.trim();
    if (!question) return;
    
    queryInput.value = '';
    handleQuery(question);
}

// Main logic to query LLM endpoint
async function handleQuery(question) {
    isQuerying = true;
    
    // 1. Append user message
    appendMessage(question, 'user');
    
    // 2. Append bot skeleton/loader
    const loaderId = appendBotLoader();
    
    // 3. Make fetch request
    try {
        const response = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || "Query failed");
        }
        
        // 4. Remove loader and append bot response
        removeLoader(loaderId);
        appendMessage(data.answer, 'bot');
        
    } catch (err) {
        removeLoader(loaderId);
        appendMessage(`Failed to answer query. ${err.message}`, 'bot error-message');
    } finally {
        isQuerying = false;
    }
}

// Append Chat Messages
function appendMessage(text, sender) {
    const isBot = sender.includes('bot');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-msg`;
    
    const avatarIcon = isBot ? 'bot' : 'user';
    const contentHTML = isBot ? parseMarkdown(text) : `<p>${escapeHTML(text)}</p>`;
    
    msgDiv.innerHTML = `
        <div class="msg-avatar">
            <i data-lucide="${avatarIcon}"></i>
        </div>
        <div class="msg-content">
            ${contentHTML}
        </div>
    `;
    
    chatMessages.appendChild(msgDiv);
    lucide.createIcons();
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add animated typing dots placeholder
function appendBotLoader() {
    const id = 'loader-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-msg';
    msgDiv.id = id;
    
    msgDiv.innerHTML = `
        <div class="msg-avatar">
            <i data-lucide="bot"></i>
        </div>
        <div class="msg-content">
            <div class="loading-bubble">
                <span class="loading-dot"></span>
                <span class="loading-dot"></span>
                <span class="loading-dot"></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(msgDiv);
    lucide.createIcons();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}

function removeLoader(id) {
    const loader = document.getElementById(id);
    if (loader) {
        loader.remove();
    }
}

function clearChat() {
    // Retain only the welcome screen
    const welcome = chatMessages.querySelector('.welcome-msg');
    chatMessages.innerHTML = '';
    if (welcome) {
        chatMessages.appendChild(welcome);
    }
    showToast("Chat cleared", "info");
}

// Utility: Prevent XSS
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Simple Markdown Parser (Heading, Lists, Code, Bold, Tables)
function parseMarkdown(md) {
    let html = escapeHTML(md);
    
    // Parse Code blocks (```lang ... ```)
    const codeBlockRegex = /```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g;
    html = html.replace(codeBlockRegex, (match, code) => {
        return `<pre><code>${code}</code></pre>`;
    });
    
    // Parse Inline code (`code`)
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Parse Bold (**bold**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Parse Italic (*italic*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Parse Headings (### title)
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Parse Markdown Tables
    const tableRegex = /((?:\|[^\n]*\|(?:\n|$))+)/g;
    html = html.replace(tableRegex, (match) => {
        const lines = match.trim().split('\n');
        if (lines.length < 2) return match;
        
        let tableHtml = '<table>';
        
        // Extract headers
        const headerRow = lines[0].split('|').map(cell => cell.trim()).filter((cell, i, arr) => i > 0 && i < arr.length - 1);
        tableHtml += '<thead><tr>';
        headerRow.forEach(header => {
            tableHtml += `<th>${header}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        
        // Skip separator line (lines[1]) and parse rows
        for (let i = 2; i < lines.length; i++) {
            const cells = lines[i].split('|').map(cell => cell.trim()).filter((cell, i, arr) => i > 0 && i < arr.length - 1);
            if (cells.length === 0) continue;
            tableHtml += '<tr>';
            cells.forEach(cell => {
                tableHtml += `<td>${cell}</td>`;
            });
            tableHtml += '</tr>';
        }
        
        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // Parse Lists
    // Unordered lists (- item or * item)
    html = html.replace(/^\s*[-*]\s+(.*?)$/gm, '<li>$1</li>');
    // Group lists
    html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
    
    // Parse Line breaks (convert single newlines to <br>, but don't double wrap items)
    html = html.split('\n').map(line => {
        if (line.trim().startsWith('<h') || 
            line.trim().startsWith('<ul') || 
            line.trim().startsWith('</ul') || 
            line.trim().startsWith('<li') || 
            line.trim().startsWith('<table') || 
            line.trim().startsWith('</table') || 
            line.trim().startsWith('<tr') || 
            line.trim().startsWith('</tr') || 
            line.trim().startsWith('<td') || 
            line.trim().startsWith('<th') || 
            line.trim().startsWith('<pre') || 
            line.trim().startsWith('</pre') || 
            line.trim() === '') {
            return line;
        }
        return `${line}<br>`;
    }).join('\n');
    
    return html;
}
