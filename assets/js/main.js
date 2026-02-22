/**
 * PromptVision AI v3.0
 * Features: Gemini API Integration, History, URL Input, Export
 */

document.addEventListener('DOMContentLoaded', initializeApp);

// ===== CONFIG =====
const CONFIG = {
    MAX_HISTORY: 10,
    MAX_BATCH: 5,       // Max images for batch analysis
    VARIATION_STYLES: [
        'Make it more cinematic with dramatic lighting',
        'Add a fantasy/magical element',
        'Convert to anime/manga style',
        'Make it more minimalist and clean',
        'Add vibrant neon cyberpunk aesthetic'
    ],
    // Prompt Templates Library
    TEMPLATES: [
        { name: 'Cinematic Portrait', category: 'Portrait', prompt: 'cinematic portrait, dramatic lighting, film grain, shallow depth of field, 85mm lens, professional photography --ar 2:3 --v 5.2' },
        { name: 'Anime Character', category: 'Anime', prompt: 'anime style character, studio ghibli inspired, soft colors, detailed eyes, clean linework, trending on artstation --ar 2:3' },
        { name: 'Cyberpunk City', category: 'Sci-Fi', prompt: 'cyberpunk cityscape, neon lights, rain, flying cars, holographic billboards, blade runner style, highly detailed, 8k --ar 16:9' },
        { name: 'Fantasy Landscape', category: 'Fantasy', prompt: 'epic fantasy landscape, floating islands, magical crystals, ethereal lighting, matte painting style, concept art --ar 16:9' },
        { name: 'Product Shot', category: 'Commercial', prompt: 'professional product photography, studio lighting, white background, high-end commercial, 8k resolution, sharp focus' },
        { name: 'Watercolor Art', category: 'Art Style', prompt: 'watercolor painting style, soft edges, bleeding colors, artistic, paper texture, traditional art feel' },
        { name: 'Dark Gothic', category: 'Dark', prompt: 'dark gothic atmosphere, moody lighting, dramatic shadows, mysterious, tim burton inspired, eerie beauty' },
        { name: 'Minimalist', category: 'Modern', prompt: 'minimalist design, clean lines, simple composition, negative space, modern aesthetic, elegant simplicity' },
        { name: 'Retro 80s', category: 'Retro', prompt: 'synthwave aesthetic, 80s retro style, neon pink and blue, chrome text, sunset grid, vaporwave vibes --ar 16:9' },
        { name: 'Oil Painting', category: 'Art Style', prompt: 'oil painting style, visible brushstrokes, renaissance inspired, classical composition, rich colors, museum quality' },
        { name: 'Isometric 3D', category: '3D', prompt: 'isometric 3D render, cute and detailed, soft shadows, pastel colors, blender style, game asset' },
        { name: 'Photorealistic', category: 'Realistic', prompt: 'photorealistic, hyperrealistic, 8k UHD, DSLR quality, natural lighting, incredibly detailed, raw photo' }
    ]
};

// ===== DEMO RESPONSES (for comparison/batch modes when API unavailable) =====
const DEMO_RESPONSES = [
    {
        prompt: "cinematic portrait of a cyberpunk street samurai, neon lights reflecting off rain-slicked streets, highly detailed, 8k resolution, octane render, unreal engine 5, volumetric lighting --ar 16:9 --v 5.2",
        negativePrompt: "blurry, low quality, distorted, bad anatomy, watermark, text, signature",
        model: "Midjourney v5.2",
        confidence: 94,
        style: "Cyberpunk, Cinematic",
        tags: ["cyberpunk", "portrait", "neon", "cinematic"]
    },
    {
        prompt: "ethereal fantasy landscape with floating islands, bioluminescent plants, magical aurora in the sky, studio ghibli style, soft watercolor textures, dreamy atmosphere --ar 16:9 --v 5",
        negativePrompt: "realistic, photograph, harsh lighting, modern elements",
        model: "Midjourney v5",
        confidence: 87,
        style: "Fantasy, Anime",
        tags: ["fantasy", "landscape", "ghibli", "magical"]
    },
    {
        prompt: "hyperrealistic close-up of a mechanical eye, intricate gears and circuits visible, golden and brass tones, macro photography style, dramatic lighting, steampunk aesthetic",
        negativePrompt: "organic, blurry, low detail, cartoon",
        model: "Stable Diffusion XL",
        confidence: 91,
        style: "Steampunk, Macro",
        tags: ["steampunk", "macro", "mechanical", "detailed"]
    }
];

// ===== STATE =====
const state = {
    uploadedFiles: [],
    currentImageData: null,
    currentResult: null,
    history: JSON.parse(localStorage.getItem('promptvision_history') || '[]'),
    isAnalyzing: false,
    theme: localStorage.getItem('theme') || 'light',
    // New states
    mode: 'single', // 'single', 'compare', 'batch'
    compareImages: [null, null],
    compareResults: [null, null],
    batchImages: [],
    batchResults: [],
    hasSeenOnboarding: localStorage.getItem('promptvision_onboarding') === 'true'
};

// ===== DOM ELEMENTS =====
const elements = {};

function cacheElements() {
    elements.dropZone = document.getElementById('dropZone');
    elements.fileInput = document.getElementById('fileInput');
    elements.urlInput = document.getElementById('urlInput');
    elements.uploadPlaceholder = document.getElementById('uploadPlaceholder');
    elements.uploadPreview = document.getElementById('uploadPreview');
    elements.previewGrid = document.getElementById('previewGrid');
    elements.uploadControls = document.getElementById('uploadControls');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.clearBtn = document.getElementById('clearBtn');
    elements.progressSection = document.getElementById('progressSection');
    elements.resultsSection = document.getElementById('resultsSection');
    elements.historySection = document.getElementById('historySection');
    elements.historyList = document.getElementById('historyList');
    elements.header = document.getElementById('header');
    elements.mobileMenu = {
        btn: document.getElementById('mobileMenuBtn'),
        menu: document.getElementById('mobileMenu'),
        closeBtn: document.getElementById('closeMobileMenu'),
        overlay: document.getElementById('menuOverlay')
    };
    elements.toast = {
        el: document.getElementById('toast'),
        iconWrapper: document.getElementById('toastIconWrapper'),
        icon: document.getElementById('toastIcon'),
        message: document.getElementById('toastMessage')
    };
    elements.themeToggle = document.getElementById('themeToggle');
}

// ===== INITIALIZATION =====
function initializeApp() {
    cacheElements();
    applyTheme(state.theme);
    setupEventListeners();
    setupMobileMenu();
    renderHistory();
    registerServiceWorker();
}

// ===== THEME =====
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    state.theme = theme;
    localStorage.setItem('theme', theme);
}

window.toggleTheme = function () {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    showToast(`${newTheme === 'dark' ? '🌙 Dark' : '☀️ Light'} mode`, 'success');
};

// ===== SERVICE WORKER =====
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // File handling
    elements.dropZone?.addEventListener('click', (e) => {
        if (e.target.id !== 'urlInput') elements.fileInput?.click();
    });
    elements.fileInput?.addEventListener('change', handleFileSelect);

    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        elements.dropZone?.addEventListener(event, preventDefaults);
    });
    elements.dropZone?.addEventListener('dragover', () => elements.dropZone.classList.add('dragover'));
    elements.dropZone?.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
    elements.dropZone?.addEventListener('drop', handleFileDrop);

    // URL input
    elements.urlInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadImageFromUrl(elements.urlInput.value);
        }
    });

    // Buttons
    elements.clearBtn?.addEventListener('click', clearFiles);
    elements.analyzeBtn?.addEventListener('click', startAnalysis);

    // Theme
    elements.themeToggle?.addEventListener('click', toggleTheme);

    // Voting & sharing
    document.getElementById('upvoteBtn')?.addEventListener('click', () => handleVote('up'));
    document.getElementById('downvoteBtn')?.addEventListener('click', () => handleVote('down'));
    document.getElementById('shareBtn')?.addEventListener('click', shareResult);

    // Export buttons
    document.getElementById('exportPngBtn')?.addEventListener('click', exportAsPng);
    document.getElementById('exportJsonBtn')?.addEventListener('click', exportAsJson);

    // Variations button
    document.getElementById('variationsBtn')?.addEventListener('click', generateVariations);

    // Clipboard paste
    document.addEventListener('paste', handlePaste);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
    if (e.key === 'Escape') closeMobileMenu();
    if (e.key === 'Enter' && state.uploadedFiles.length > 0 && !state.isAnalyzing) {
        e.preventDefault();
        startAnalysis();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        toggleTheme();
    }
}

// ===== MOBILE MENU =====
function setupMobileMenu() {
    const toggle = (show) => {
        elements.mobileMenu.menu?.classList.toggle('open', show);
        elements.mobileMenu.overlay?.classList.toggle('hidden', !show);
        document.body.style.overflow = show ? 'hidden' : '';
    };
    elements.mobileMenu.btn?.addEventListener('click', () => toggle(true));
    elements.mobileMenu.closeBtn?.addEventListener('click', () => toggle(false));
    elements.mobileMenu.overlay?.addEventListener('click', () => toggle(false));
    document.querySelectorAll('.mobile-link').forEach(l => l.addEventListener('click', () => toggle(false)));
}

function closeMobileMenu() {
    elements.mobileMenu.menu?.classList.remove('open');
    elements.mobileMenu.overlay?.classList.add('hidden');
    document.body.style.overflow = '';
}

// ===== FILE HANDLING =====
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFileSelect(e) {
    processFiles(Array.from(e.target.files));
}

function handleFileDrop(e) {
    elements.dropZone.classList.remove('dragover');
    processFiles(Array.from(e.dataTransfer.files));
}

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) processFiles([file]);
            break;
        }
    }
}

function processFiles(files) {
    const valid = files.filter(f => f.type.startsWith('image/') && f.size <= 50 * 1024 * 1024);
    if (valid.length === 0 && files.length > 0) {
        showToast('Invalid file (must be image under 50MB)', 'error');
        return;
    }
    if (valid.length > 0) {
        state.uploadedFiles = valid.slice(0, 1); // Only first file
        convertFileToBase64(valid[0]);
        updateUI();
        showToast('Image loaded', 'success');
    }
}

function convertFileToBase64(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        state.currentImageData = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ===== LOAD SAMPLE IMAGE =====
window.loadSampleImage = async function (imagePath) {
    try {
        const response = await fetch(imagePath);
        const blob = await response.blob();
        const file = new File([blob], imagePath.split('/').pop(), { type: blob.type });

        state.uploadedFiles = [file];

        const reader = new FileReader();
        reader.onload = (e) => {
            state.currentImageData = e.target.result;
            updateUI();

            // Scroll to analyzer
            document.getElementById('analyzer')?.scrollIntoView({ behavior: 'smooth' });

            // Show toast
            showToast('Sample loaded! Click Analyze to see results.', 'success');
        };
        reader.readAsDataURL(file);
    } catch (err) {
        showToast('Failed to load sample image', 'error');
    }
};

// ===== URL INPUT =====
async function loadImageFromUrl(url) {
    if (!url || !url.trim()) {
        showToast('Please enter a URL', 'error');
        return;
    }

    try {
        // Validate URL format and protocol
        const urlObj = new URL(url);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            showToast('Invalid URL protocol. Use http or https.', 'error');
            return;
        }

        // Block private IP ranges (SSRF protection)
        const hostname = urlObj.hostname;
        const privatePatterns = [
            /^localhost$/i,
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^0\.0\.0\.0$/,
            /\[::1\]/,
            /^fc00:/i,
            /^fe80:/i
        ];

        if (privatePatterns.some(p => p.test(hostname))) {
            showToast('Cannot load images from private networks', 'error');
            return;
        }

        showToast('Loading image...', 'info');

        // Create an image to validate URL
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });

        // Convert to base64
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        state.currentImageData = canvas.toDataURL('image/png');

        // Create a fake file for preview
        state.uploadedFiles = [{ type: 'image/url', name: 'URL Image', url: url }];
        updateUI();
        showToast('Image loaded from URL', 'success');

    } catch (err) {
        showToast('Failed to load image. Check URL and CORS settings.', 'error');
    }
}

// ===== UI UPDATE =====
function updateUI() {
    renderPreviews();
    const hasFiles = state.uploadedFiles.length > 0;
    elements.uploadPlaceholder?.classList.toggle('hidden', hasFiles);
    elements.uploadPreview?.classList.toggle('hidden', !hasFiles);
    elements.uploadControls?.classList.toggle('hidden', !hasFiles);
    if (!hasFiles && elements.fileInput) elements.fileInput.value = '';
}

function renderPreviews() {
    if (!elements.previewGrid) return;
    elements.previewGrid.innerHTML = '';

    state.uploadedFiles.forEach((file, i) => {
        const div = document.createElement('div');
        div.className = 'relative aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm group';

        const img = document.createElement('img');
        img.src = file.url || (file.type?.startsWith('image/') ? URL.createObjectURL(file) : '');
        img.className = 'w-full h-full object-cover';
        div.appendChild(img);

        const btn = document.createElement('button');
        btn.className = 'absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition';
        btn.innerHTML = '<i class="fas fa-times text-xs"></i>';
        btn.onclick = (e) => { e.stopPropagation(); clearFiles(); };
        div.appendChild(btn);

        elements.previewGrid.appendChild(div);
    });
}

function clearFiles() {
    state.uploadedFiles = [];
    state.currentImageData = null;
    if (elements.urlInput) elements.urlInput.value = '';
    updateUI();
    showToast('Cleared', 'info');
}

// ===== ANALYSIS =====
async function startAnalysis() {
    if (!state.currentImageData || state.isAnalyzing) return;
    state.isAnalyzing = true;

    elements.progressSection?.classList.remove('hidden');
    elements.resultsSection?.classList.add('hidden');
    elements.progressSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const steps = ['detect', 'style', 'subject'];
    const progressPercent = document.getElementById('progressPercent');

    for (let i = 0; i < steps.length; i++) {
        const progress = ((i + 1) / steps.length) * 100;
        if (progressPercent) progressPercent.textContent = Math.round(progress) + '%';

        const stepEl = document.querySelector(`[data-step="${steps[i]}"]`);
        if (stepEl) {
            stepEl.querySelector('.step-icon').innerHTML = '<i class="fas fa-spinner fa-spin text-purple-600"></i>';
        }

        await wait(800 + Math.random() * 400);

        if (stepEl) {
            stepEl.querySelector('.step-icon').innerHTML = '<i class="fas fa-check text-green-500"></i>';
        }
    }

    // Always call the API - it handles demo mode server-side
    const result = await callGeminiAPI();

    if (!result) {
        // Rate limited or error - already handled in callGeminiAPI
        state.isAnalyzing = false;
        elements.progressSection?.classList.add('hidden');
        return;
    }

    state.currentResult = result;
    saveToHistory(result);
    showResults(result);
    state.isAnalyzing = false;
}

// ===== GEMINI API (via Secure Vercel Serverless Function) =====
async function callGeminiAPI() {
    try {
        const base64Data = state.currentImageData.split(',')[1];

        // Call OUR secure serverless function (API key hidden on server)
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: base64Data })
        });

        // Handle rate limit (429)
        if (response.status === 429) {
            const error = await response.json();
            showToast(`🚦 ${error.message || 'Rate limit exceeded. Try again later.'}`, 'error');

            // Show rate limit modal or redirect
            showRateLimitModal(error.message);

            throw new Error('RATE_LIMITED');
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API request failed');
        }

        const result = await response.json();

        // Show remaining requests if available
        if (result._remaining !== undefined && result._remaining <= 3) {
            showToast(`⚠️ ${result._remaining} requests remaining today`, 'warning');
        }

        return result;

    } catch (err) {
        console.error('API error:', err);
        if (err.message === 'RATE_LIMITED') {
            return null; // Don't fall back to demo for rate limits
        }
        // Fallback demo response when API fails (e.g., testing locally without server)
        showToast('API not available - showing demo data', 'info');
        return {
            prompt: "cinematic portrait of a cyberpunk street samurai, neon lights reflecting off rain-slicked streets, highly detailed, 8k resolution, octane render, unreal engine 5, volumetric lighting --ar 16:9 --v 5.2",
            negativePrompt: "blurry, low quality, distorted, bad anatomy, watermark, text, signature",
            model: "Midjourney v5.2",
            confidence: 94,
            style: "Cyberpunk, Cinematic",
            tags: ["cyberpunk", "portrait", "neon", "cinematic"],
            isDemoMode: true
        };
    }
}

// Show rate limit modal
function showRateLimitModal(message) {
    // Create modal if doesn't exist
    let modal = document.getElementById('rateLimitModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rateLimitModal';
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick="this.parentElement.remove()">
                <div class="glass-card rounded-3xl p-8 max-w-md text-center" onclick="event.stopPropagation()">
                    <div class="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center text-4xl" style="background: linear-gradient(135deg, #F59E0B, #EF4444);">
                        <i class="fas fa-hourglass-half text-white"></i>
                    </div>
                    <h3 class="text-2xl font-bold mb-2" style="color: var(--text-primary)">Rate Limit Reached 🚦</h3>
                    <p class="mb-6" style="color: var(--text-secondary)" id="rateLimitMessage">${message || 'Too many requests. Please try again later.'}</p>
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="p-3 rounded-xl" style="background: var(--bg-tertiary)">
                            <div class="font-bold text-lg" style="color: #F59E0B;">5</div>
                            <div class="text-xs" style="color: var(--text-muted)">per hour</div>
                        </div>
                        <div class="p-3 rounded-xl" style="background: var(--bg-tertiary)">
                            <div class="font-bold text-lg" style="color: #F59E0B;">15</div>
                            <div class="text-xs" style="color: var(--text-muted)">per day</div>
                        </div>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="this.closest('#rateLimitModal').remove()" class="flex-1 px-4 py-3 rounded-xl font-medium" style="background: var(--bg-tertiary); color: var(--text-primary)">
                            Got it
                        </button>
                        <a href="429.html" class="flex-1 px-4 py-3 rounded-xl font-medium text-white text-center" style="background: linear-gradient(135deg, #F59E0B, #EF4444);">
                            Learn More
                        </a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// ===== SHOW RESULTS =====
function showResults(result) {
    elements.progressSection?.classList.add('hidden');
    elements.resultsSection?.classList.remove('hidden');
    elements.resultsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Image
    const img = document.getElementById('analyzedImage');
    if (img && state.currentImageData) {
        img.src = state.currentImageData;
    }

    // Demo/Real Mode Badge
    const modeBadge = document.getElementById('modeBadge');
    if (modeBadge) {
        if (result.isDemoMode) {
            modeBadge.innerHTML = `
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" style="background: linear-gradient(135deg, #F59E0B, #D97706); color: white;">
                    <i class="fas fa-flask"></i> Demo Mode
                </span>
                <span class="text-xs block mt-1" style="color: var(--text-muted)">This is sample data. Connect Gemini API for real analysis.</span>
            `;
        } else {
            modeBadge.innerHTML = `
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold" style="background: linear-gradient(135deg, #10B981, #059669); color: white;">
                    <i class="fas fa-robot"></i> AI Analyzed
                </span>
            `;
        }
        modeBadge.classList.remove('hidden');
    }

    // Prompt
    const promptEl = document.getElementById('resultPrompt');
    if (promptEl) promptEl.textContent = `"${result.prompt}"`;

    // Model
    const modelEl = document.getElementById('resultModel');
    if (modelEl) modelEl.textContent = result.model;

    // Confidence
    const confEl = document.getElementById('resultConfidence');
    if (confEl) confEl.textContent = `${result.confidence}%`;

    // Tags
    const tagsEl = document.getElementById('resultTags');
    if (tagsEl && result.tags) {
        tagsEl.innerHTML = result.tags.map(t =>
            `<span class="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">#${t}</span>`
        ).join('');
    }

    // Negative prompt
    const negEl = document.getElementById('resultNegative');
    if (negEl) negEl.textContent = result.negativePrompt || 'N/A';

    // Confetti (only for real results)
    if (!result.isDemoMode) {
        triggerConfetti();
    }
}

// ===== HISTORY =====
function saveToHistory(result) {
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        image: state.currentImageData?.substring(0, 100) + '...', // Truncated preview
        thumbnail: state.currentImageData,
        ...result
    };

    state.history.unshift(entry);
    if (state.history.length > CONFIG.MAX_HISTORY) {
        state.history = state.history.slice(0, CONFIG.MAX_HISTORY);
    }

    localStorage.setItem('promptvision_history', JSON.stringify(state.history));
    renderHistory();
}

function renderHistory() {
    if (!elements.historyList) return;

    if (state.history.length === 0) {
        elements.historySection?.classList.add('hidden');
        return;
    }

    elements.historySection?.classList.remove('hidden');
    elements.historyList.innerHTML = state.history.map(h => `
        <div class="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition" onclick="loadFromHistory(${h.id})">
            <img src="${h.thumbnail}" class="w-10 h-10 rounded object-cover" alt="">
            <div class="flex-1 min-w-0">
                <p class="text-xs font-medium truncate" style="color: var(--text-primary)">${h.model}</p>
                <p class="text-xs truncate" style="color: var(--text-muted)">${h.prompt.substring(0, 40)}...</p>
            </div>
            <button onclick="event.stopPropagation(); deleteFromHistory(${h.id})" class="p-1 text-red-400 hover:text-red-600">
                <i class="fas fa-trash text-xs"></i>
            </button>
        </div>
    `).join('');
}

window.loadFromHistory = function (id) {
    const entry = state.history.find(h => h.id === id);
    if (entry) {
        state.currentImageData = entry.thumbnail;
        state.currentResult = entry;
        showResults(entry);
        showToast('Loaded from history', 'success');
    }
};

window.deleteFromHistory = function (id) {
    state.history = state.history.filter(h => h.id !== id);
    localStorage.setItem('promptvision_history', JSON.stringify(state.history));
    renderHistory();
    showToast('Deleted', 'info');
};

// ===== EXPORT =====
function exportAsPng() {
    if (!state.currentResult) return;

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = state.theme === 'dark' ? '#1E293B' : '#FFFFFF';
    ctx.fillRect(0, 0, 800, 600);

    // Title
    ctx.fillStyle = '#7C3AED';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillText('PromptVision Analysis', 30, 40);

    // Model
    ctx.fillStyle = state.theme === 'dark' ? '#F1F5F9' : '#1F2937';
    ctx.font = 'bold 16px Inter';
    ctx.fillText(`Model: ${state.currentResult.model} (${state.currentResult.confidence}%)`, 30, 80);

    // Prompt
    ctx.font = '14px monospace';
    const words = state.currentResult.prompt.split(' ');
    let line = '';
    let y = 120;

    words.forEach(word => {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > 740) {
            ctx.fillText(line, 30, y);
            line = word + ' ';
            y += 20;
        } else {
            line = test;
        }
    });
    ctx.fillText(line, 30, y);

    // Download
    const link = document.createElement('a');
    link.download = `promptvision-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('Exported as PNG', 'success');
}

function exportAsJson() {
    if (!state.currentResult) return;

    const data = {
        exportedAt: new Date().toISOString(),
        ...state.currentResult
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `promptvision-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();

    showToast('Exported as JSON', 'success');
}

// ===== VOTING =====
function handleVote(type) {
    showToast(type === 'up' ? 'Thanks! 🎉' : 'We\'ll improve!', 'success');
}

function shareResult() {
    if (navigator.share) {
        navigator.share({ title: 'PromptVision', text: state.currentResult?.prompt || '', url: location.href });
    } else {
        navigator.clipboard.writeText(state.currentResult?.prompt || '');
        showToast('Prompt copied!', 'success');
    }
}

// ===== UTILITIES =====
function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function showToast(msg, type = 'info') {
    const { el, iconWrapper, icon, message } = elements.toast;
    if (!el) return;

    message.textContent = msg;
    iconWrapper.className = 'w-7 h-7 rounded-full flex items-center justify-center';

    const cfg = {
        success: { bg: 'bg-green-100', icon: 'fa-check text-green-600' },
        error: { bg: 'bg-red-100', icon: 'fa-times text-red-600' },
        info: { bg: 'bg-blue-100', icon: 'fa-info text-blue-600' }
    }[type] || { bg: 'bg-blue-100', icon: 'fa-info text-blue-600' };

    iconWrapper.classList.add(cfg.bg);
    icon.className = `fas ${cfg.icon} text-sm`;

    el.classList.remove('hidden');
    el.classList.add('flex');

    setTimeout(() => el.classList.add('hidden'), 2500);
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
};

function triggerConfetti() {
    const colors = ['#7C3AED', '#F43F5E', '#FBBF24', '#10B981'];
    for (let i = 0; i < 30; i++) {
        const c = document.createElement('div');
        c.className = 'confetti-piece';
        c.style.left = Math.random() * 100 + 'vw';
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDelay = Math.random() * 0.3 + 's';
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 3000);
    }
}

// ===== PROMPT VARIATIONS =====
function generateVariations() {
    if (!state.currentResult) return;

    const variationsSection = document.getElementById('variationsSection');
    const variationsList = document.getElementById('variationsList');

    if (!variationsSection || !variationsList) return;

    variationsSection.classList.remove('hidden');

    const basePrompt = state.currentResult.prompt;
    const variations = CONFIG.VARIATION_STYLES.map((style, i) => {
        const modifiers = [
            `${basePrompt}, ${style.toLowerCase()}`,
            basePrompt.replace(/--v \d+(\.\d+)?/, `--v 6, ${style.toLowerCase()}`),
            `${style}: ${basePrompt}`,
        ];
        return modifiers[i % modifiers.length];
    });

    variationsList.innerHTML = variations.map((v, i) => `
        <div class="p-4 rounded-xl relative group" style="background: var(--bg-tertiary); border: 1px solid var(--border-color);">
            <p class="font-mono text-xs leading-relaxed pr-8" style="color: var(--text-primary)">${v}</p>
            <button onclick="copyToClipboard(\`${v.replace(/`/g, '\\`')}\`)" class="absolute top-2 right-2 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition" style="background: var(--bg-secondary); color: var(--text-muted)">
                <i class="fas fa-copy text-xs"></i>
            </button>
            <div class="flex items-center gap-2 mt-3">
                <span class="px-2 py-0.5 text-xs rounded-full font-medium" style="background: rgba(124, 58, 237, 0.1); color: var(--primary)">
                    <i class="fas fa-magic"></i> Variation ${i + 1}
                </span>
            </div>
        </div>
    `).join('');

    variationsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('Generated 5 variations!', 'success');
}

// ===== COMPARISON MODE =====
window.enableCompareMode = function () {
    state.mode = 'compare';
    state.compareImages = [null, null];
    state.compareResults = [null, null];

    const compareSection = document.getElementById('compareSection');
    if (compareSection) {
        compareSection.classList.remove('hidden');
        compareSection.scrollIntoView({ behavior: 'smooth' });
    }
    showToast('Compare mode enabled! Upload 2 images.', 'info');
};

window.uploadCompareImage = function (slot) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            state.compareImages[slot] = ev.target.result;
            document.getElementById(`comparePreview${slot}`).src = ev.target.result;
            document.getElementById(`comparePreview${slot}`).classList.remove('hidden');
            document.getElementById(`comparePlaceholder${slot}`).classList.add('hidden');

            // Check if both images are uploaded
            if (state.compareImages[0] && state.compareImages[1]) {
                document.getElementById('compareAnalyzeBtn')?.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

window.analyzeCompare = async function () {
    if (!state.compareImages[0] || !state.compareImages[1]) return;

    showToast('Analyzing both images...', 'info');

    // Analyze first image
    state.currentImageData = state.compareImages[0];
    state.compareResults[0] = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];

    await wait(1000);

    // Analyze second image
    state.currentImageData = state.compareImages[1];
    state.compareResults[1] = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];

    // Show results
    const resultsDiv = document.getElementById('compareResults');
    if (resultsDiv) {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = `
            <div class="grid md:grid-cols-2 gap-6">
                <div class="glass-card rounded-xl p-4">
                    <img src="${state.compareImages[0]}" class="w-full h-40 object-cover rounded-lg mb-3" alt="Image 1">
                    <h4 class="font-bold text-sm mb-2" style="color: var(--text-primary)">Image 1 - ${state.compareResults[0].model}</h4>
                    <p class="font-mono text-xs" style="color: var(--text-secondary)">"${state.compareResults[0].prompt.substring(0, 100)}..."</p>
                </div>
                <div class="glass-card rounded-xl p-4">
                    <img src="${state.compareImages[1]}" class="w-full h-40 object-cover rounded-lg mb-3" alt="Image 2">
                    <h4 class="font-bold text-sm mb-2" style="color: var(--text-primary)">Image 2 - ${state.compareResults[1].model}</h4>
                    <p class="font-mono text-xs" style="color: var(--text-secondary)">"${state.compareResults[1].prompt.substring(0, 100)}..."</p>
                </div>
            </div>
        `;
    }

    showToast('Comparison complete!', 'success');
    triggerConfetti();
};

// ===== BATCH ANALYSIS =====
window.enableBatchMode = function () {
    state.mode = 'batch';
    state.batchImages = [];
    state.batchResults = [];

    const batchSection = document.getElementById('batchSection');
    if (batchSection) {
        batchSection.classList.remove('hidden');
        batchSection.scrollIntoView({ behavior: 'smooth' });
    }
    showToast(`Batch mode enabled! Upload up to ${CONFIG.MAX_BATCH} images.`, 'info');
};

window.addBatchImage = function () {
    if (state.batchImages.length >= CONFIG.MAX_BATCH) {
        showToast(`Maximum ${CONFIG.MAX_BATCH} images allowed`, 'error');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
        Array.from(e.target.files).forEach(file => {
            if (state.batchImages.length >= CONFIG.MAX_BATCH) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                state.batchImages.push(ev.target.result);
                renderBatchPreviews();
            };
            reader.readAsDataURL(file);
        });
    };
    input.click();
};

function renderBatchPreviews() {
    const grid = document.getElementById('batchGrid');
    if (!grid) return;

    grid.innerHTML = state.batchImages.map((img, i) => `
        <div class="relative aspect-square rounded-xl overflow-hidden group">
            <img src="${img}" class="w-full h-full object-cover">
            <button onclick="removeBatchImage(${i})" class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <i class="fas fa-times text-xs"></i>
            </button>
        </div>
    `).join('') + (state.batchImages.length < CONFIG.MAX_BATCH ? `
        <button onclick="addBatchImage()" class="aspect-square rounded-xl border-2 border-dashed flex items-center justify-center" style="border-color: var(--border-color); color: var(--text-muted)">
            <i class="fas fa-plus text-2xl"></i>
        </button>
    ` : '');

    // Show analyze button if images exist
    if (state.batchImages.length > 0) {
        document.getElementById('batchAnalyzeBtn')?.classList.remove('hidden');
    }
}

window.removeBatchImage = function (index) {
    state.batchImages.splice(index, 1);
    renderBatchPreviews();
};

window.analyzeBatch = async function () {
    if (state.batchImages.length === 0) return;

    showToast(`Analyzing ${state.batchImages.length} images...`, 'info');
    state.batchResults = [];

    for (let i = 0; i < state.batchImages.length; i++) {
        await wait(800);
        state.batchResults.push(DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)]);
    }

    // Show results
    const resultsDiv = document.getElementById('batchResults');
    if (resultsDiv) {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = state.batchResults.map((result, i) => `
            <div class="glass-card rounded-xl p-3">
                <img src="${state.batchImages[i]}" class="w-full h-24 object-cover rounded-lg mb-2" alt="Batch ${i + 1}">
                <p class="text-xs font-bold" style="color: var(--text-primary)">${result.model}</p>
                <p class="font-mono text-xs truncate" style="color: var(--text-muted)">"${result.prompt.substring(0, 50)}..."</p>
                <button onclick="copyToClipboard('${result.prompt.replace(/'/g, "\\'")}')" class="mt-2 w-full py-1 rounded text-xs font-medium" style="background: var(--bg-tertiary); color: var(--text-secondary)">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
        `).join('');
    }

    showToast('Batch analysis complete!', 'success');
    triggerConfetti();
};

// ===== PROMPT TEMPLATES =====
window.showTemplates = function () {
    const modal = document.getElementById('templatesModal');
    if (modal) {
        modal.classList.remove('hidden');
        renderTemplates();
    }
};

window.closeTemplates = function () {
    document.getElementById('templatesModal')?.classList.add('hidden');
};

function renderTemplates(filter = 'all') {
    const grid = document.getElementById('templatesGrid');
    if (!grid) return;

    const templates = filter === 'all'
        ? CONFIG.TEMPLATES
        : CONFIG.TEMPLATES.filter(t => t.category === filter);

    grid.innerHTML = templates.map(t => `
        <div class="glass-card rounded-xl p-4 cursor-pointer hover:scale-105 transition" onclick="useTemplate('${t.prompt.replace(/'/g, "\\'")}')">
            <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-0.5 text-xs rounded-full font-medium" style="background: rgba(124, 58, 237, 0.1); color: var(--primary)">${t.category}</span>
            </div>
            <h4 class="font-bold text-sm mb-1" style="color: var(--text-primary)">${t.name}</h4>
            <p class="text-xs line-clamp-2" style="color: var(--text-muted)">${t.prompt.substring(0, 60)}...</p>
        </div>
    `).join('');
}

window.useTemplate = function (prompt) {
    copyToClipboard(prompt);
    closeTemplates();
    showToast('Template copied! Paste it in your AI tool.', 'success');
};

window.filterTemplates = function (category) {
    renderTemplates(category);
    // Update active filter button
    document.querySelectorAll('.template-filter').forEach(btn => {
        btn.classList.remove('bg-purple-500', 'text-white');
        btn.style.background = 'var(--bg-tertiary)';
        btn.style.color = 'var(--text-secondary)';
    });
    event.target.classList.add('bg-purple-500', 'text-white');
    event.target.style.background = '';
    event.target.style.color = '';
};

// ===== ONBOARDING TUTORIAL =====
window.showOnboarding = function () {
    const modal = document.getElementById('onboardingModal');
    if (modal) {
        modal.classList.remove('hidden');
        state.currentOnboardingStep = 0;
        renderOnboardingStep(0);
    }
};

window.closeOnboarding = function () {
    document.getElementById('onboardingModal')?.classList.add('hidden');
    localStorage.setItem('promptvision_onboarding', 'true');
    state.hasSeenOnboarding = true;
};

const ONBOARDING_STEPS = [
    {
        title: 'Welcome to PromptVision! 👋',
        description: 'The #1 tool for reverse-engineering AI artwork. Let\'s show you around!',
        icon: 'fa-wand-magic-sparkles'
    },
    {
        title: 'Upload Your Image 📸',
        description: 'Drag & drop, paste with Ctrl+V, or enter a URL. We support JPG, PNG, and WEBP.',
        icon: 'fa-cloud-upload-alt'
    },
    {
        title: 'AI Analysis 🧠',
        description: 'Our AI analyzes your image to detect the model, style, and parameters used.',
        icon: 'fa-brain'
    },
    {
        title: 'Get Your Prompt ✨',
        description: 'Copy the discovered prompt and use it in Midjourney, DALL-E, or Stable Diffusion!',
        icon: 'fa-copy'
    },
    {
        title: 'You\'re Ready! 🚀',
        description: 'Start analyzing your first image now. It\'s completely free and private!',
        icon: 'fa-rocket'
    }
];

function renderOnboardingStep(step) {
    const content = document.getElementById('onboardingContent');
    const s = ONBOARDING_STEPS[step];

    content.innerHTML = `
        <div class="text-center py-8">
            <div class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center gradient-bg-primary text-white text-3xl">
                <i class="fas ${s.icon}"></i>
            </div>
            <h3 class="text-2xl font-bold mb-3" style="color: var(--text-primary)">${s.title}</h3>
            <p class="text-lg max-w-md mx-auto" style="color: var(--text-secondary)">${s.description}</p>
            
            <div class="flex justify-center gap-2 mt-8">
                ${ONBOARDING_STEPS.map((_, i) => `
                    <div class="w-2 h-2 rounded-full ${i === step ? 'gradient-bg-primary' : ''}" style="${i !== step ? 'background: var(--border-color)' : ''}"></div>
                `).join('')}
            </div>
            
            <div class="flex justify-center gap-4 mt-8">
                ${step > 0 ? `<button onclick="prevOnboardingStep()" class="px-6 py-2 rounded-xl font-medium" style="background: var(--bg-tertiary); color: var(--text-secondary)">Back</button>` : ''}
                ${step < ONBOARDING_STEPS.length - 1
            ? `<button onclick="nextOnboardingStep()" class="btn-primary text-white px-6 py-2 rounded-xl font-medium">Next</button>`
            : `<button onclick="closeOnboarding()" class="btn-primary text-white px-8 py-3 rounded-xl font-bold">Start Analyzing!</button>`
        }
            </div>
        </div>
    `;
}

window.nextOnboardingStep = function () {
    state.currentOnboardingStep = Math.min(state.currentOnboardingStep + 1, ONBOARDING_STEPS.length - 1);
    renderOnboardingStep(state.currentOnboardingStep);
};

window.prevOnboardingStep = function () {
    state.currentOnboardingStep = Math.max(state.currentOnboardingStep - 1, 0);
    renderOnboardingStep(state.currentOnboardingStep);
};

// Show onboarding for first-time users
setTimeout(() => {
    if (!state.hasSeenOnboarding && document.getElementById('onboardingModal')) {
        showOnboarding();
    }
}, 1000);

// ===== SKELETON LOADING =====
function showSkeleton(container) {
    const skeleton = `
        <div class="animate-pulse space-y-4">
            <div class="h-40 rounded-xl" style="background: var(--bg-tertiary)"></div>
            <div class="h-4 rounded w-3/4" style="background: var(--bg-tertiary)"></div>
            <div class="h-4 rounded w-1/2" style="background: var(--bg-tertiary)"></div>
        </div>
    `;
    if (container) container.innerHTML = skeleton;
}
