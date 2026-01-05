// DOM Elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const platformBadge = document.getElementById('platformBadge');
const resultsSection = document.getElementById('resultsSection');
const formatsList = document.getElementById('formatsList');
const downloadBtn = document.getElementById('downloadBtn');
const mediaTitle = document.getElementById('mediaTitle');
const mediaPlatform = document.getElementById('mediaPlatform');
const mediaDuration = document.getElementById('mediaDuration');
const toast = document.getElementById('toast');

let selectedFormat = null;
let currentMediaInfo = null;

// Platform detection patterns
const platformPatterns = {
    tiktok: { pattern: /tiktok\.com|vm\.tiktok\.com/i, name: 'TikTok', icon: '🎵', color: '#00f2ea' },
    instagram: { pattern: /instagram\.com/i, name: 'Instagram', icon: '📸', color: '#e4405f' },
    youtube: { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube', icon: '▶️', color: '#ff0000' },
    twitter: { pattern: /twitter\.com|x\.com/i, name: 'Twitter/X', icon: '🐦', color: '#1da1f2' },
    facebook: { pattern: /facebook\.com|fb\.watch/i, name: 'Facebook', icon: '👤', color: '#1877f2' },
    pinterest: { pattern: /pinterest\.com|pin\.it/i, name: 'Pinterest', icon: '📌', color: '#e60023' },
    reddit: { pattern: /reddit\.com/i, name: 'Reddit', icon: '🤖', color: '#ff4500' },
    vimeo: { pattern: /vimeo\.com/i, name: 'Vimeo', icon: '🎬', color: '#1ab7ea' },
    twitch: { pattern: /twitch\.tv/i, name: 'Twitch', icon: '🎮', color: '#9146ff' },
    snapchat: { pattern: /snapchat\.com/i, name: 'Snapchat', icon: '👻', color: '#fffc00' },
    soundcloud: { pattern: /soundcloud\.com/i, name: 'SoundCloud', icon: '🎧', color: '#ff5500' },
    dailymotion: { pattern: /dailymotion\.com/i, name: 'Dailymotion', icon: '📺', color: '#0066dc' }
};

// Detect platform from URL
function detectPlatform(url) {
    for (const [key, platform] of Object.entries(platformPatterns)) {
        if (platform.pattern.test(url)) {
            return { key, ...platform };
        }
    }
    return null;
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastMessage = toast.querySelector('.toast-message');
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.className = 'toast hidden', 300);
    }, 4000);
}

// Update platform badge
function updatePlatformBadge(platform) {
    if (platform) {
        platformBadge.innerHTML = `${platform.icon} ${platform.name} <span style="color: ${platform.color}">✓ Detected</span>`;
        platformBadge.classList.remove('hidden');
    } else {
        platformBadge.classList.add('hidden');
    }
}

// Handle URL input changes
urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    if (url) {
        const platform = detectPlatform(url);
        updatePlatformBadge(platform);
    } else {
        platformBadge.classList.add('hidden');
    }
});

// Paste button handler
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        urlInput.value = text;
        urlInput.dispatchEvent(new Event('input'));
        showToast('Link pasted!', 'success');
    } catch (err) {
        showToast('Failed to paste. Please paste manually.', 'error');
    }
});

// Analyze button handler
analyzeBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();

    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }

    // Show loading state
    const btnText = analyzeBtn.querySelector('.btn-text');
    const btnLoader = analyzeBtn.querySelector('.btn-loader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    analyzeBtn.disabled = true;
    resultsSection.classList.add('hidden');

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (data.success) {
            currentMediaInfo = data;
            displayResults(data);
            showToast('Media found! Select a format to download.', 'success');
        } else {
            showToast(data.error || 'Failed to analyze URL', 'error');
        }
    } catch (error) {
        showToast('Error connecting to server. Make sure the server is running.', 'error');
        console.error(error);
    } finally {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
});

// Display results
function displayResults(data) {
    mediaTitle.textContent = data.title;
    mediaPlatform.textContent = `${data.platformIcon} ${data.platformName}`;
    mediaPlatform.style.background = `${data.platformColor}20`;
    mediaPlatform.style.color = data.platformColor;
    mediaDuration.textContent = data.duration ? `⏱ ${data.duration}` : '';

    // Clear and populate formats
    formatsList.innerHTML = '';
    selectedFormat = null;
    downloadBtn.disabled = true;

    data.formats.forEach((format, index) => {
        const formatEl = document.createElement('div');
        formatEl.className = 'format-option';
        if (index === 0) formatEl.classList.add('recommended');
        formatEl.dataset.formatId = format.id;

        const icon = format.type === 'video' ? '🎬' :
            format.type === 'audio' ? '🎵' :
                format.type === 'image' ? '🖼️' : '📄';

        formatEl.innerHTML = `
            <div class="format-info">
                <div class="format-icon">${icon}</div>
                <div class="format-details">
                    <h4>${format.label}${index === 0 ? ' <span class="rec-badge">RECOMMENDED</span>' : ''}</h4>
                    <span>${format.quality} • ${format.ext?.toUpperCase() || 'MP4'}</span>
                </div>
            </div>
            <span class="format-size">${format.size}</span>
        `;

        formatEl.addEventListener('click', () => selectFormat(format, formatEl));
        formatsList.appendChild(formatEl);
    });

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Select format
function selectFormat(format, element) {
    document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedFormat = format;
    downloadBtn.disabled = false;
}

// Download button handler
downloadBtn.addEventListener('click', async () => {
    if (!selectedFormat || !currentMediaInfo) {
        showToast('Please select a format first', 'error');
        return;
    }

    downloadBtn.disabled = true;
    const originalContent = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<div class="spinner"></div> <span>Downloading & Converting...</span>';

    showToast('⏳ Starting download... Large files may take a minute.', 'info');

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentMediaInfo.url,
                formatId: selectedFormat.id,
                title: currentMediaInfo.title
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`✅ Download complete! (${data.size})`, 'success');

            // Trigger file download
            const link = document.createElement('a');
            link.href = data.downloadUrl;
            link.download = data.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Show success animation
            downloadBtn.innerHTML = '<span>✅ Downloaded!</span>';
            setTimeout(() => {
                downloadBtn.innerHTML = originalContent;
                downloadBtn.disabled = false;
            }, 2000);
        } else {
            showToast(data.error || 'Download failed', 'error');
            downloadBtn.innerHTML = originalContent;
            downloadBtn.disabled = false;
        }
    } catch (error) {
        showToast('Error processing download. Please try again.', 'error');
        console.error(error);
        downloadBtn.innerHTML = originalContent;
        downloadBtn.disabled = false;
    }
});

// Keyboard shortcut: Enter to analyze
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        analyzeBtn.click();
    }
});

// Platform cards click handler
document.querySelectorAll('.platform-card').forEach(card => {
    card.addEventListener('click', () => {
        const platformName = card.querySelector('span:last-child').textContent;
        showToast(`Paste a ${platformName} link to download!`, 'info');
        urlInput.focus();
    });
});

// Auto-focus input on page load
window.addEventListener('load', () => {
    urlInput.focus();
});

console.log('🚀 SaveMedia App Loaded - Real Downloads Enabled');
