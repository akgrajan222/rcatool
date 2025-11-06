// Global variables for Firebase configuration, if needed (not directly used for local storage)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// IndexedDB constants
const DB_NAME = 'RCADocumentsDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let db; // IndexedDB database instance

// DOM elements
let mainNotificationArea, documentList, keywordFilter, resetFiltersButton, hiddenFileInput,
    priorityReviewModal, modalFilesList, modalErrorMessage, confirmUploadModalBtn, cancelUploadModalBtn, dropZone;

// State variables
let currentPriorityFilter = 'all';
let currentKeywordFilter = '';
let allDocuments = []; // Cache all documents for efficient filtering
let sortAsc = true; // Initial sort state for document name
let filesToUpload = []; // Array to hold { file: File, priority: string, index: number } objects

// --- NEW: Comprehensive English Stop Words List ---
// Replaces the [redacted] array
const allStopWords = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
    'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
    'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
    'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself',
    'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
    'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
    'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
    // RCA/Tech specific stopwords (add more as needed)
    'rca', 'post', 'mortem', 'incident', 'issue', 'problem', 'service', 'outage', 'error', 'failure', 'system', 'database', 'server', 'client', 'request', 'response',
    'date', 'time', 'team', 'summary', 'action', 'item', 'items', 'impact', 'root', 'cause', 'timeline', 'detection', 'resolution', 'lesson', 'learned',
    'http', 'https', 'www', 'com', 'org', 'net', 'gmt', 'utc', 'ist', 'pst', 'est', 'gcp', 'aws', 'azure', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'solution', 'mitigation', 'investigation', 'analysis', 'status', 'description', 'ticket', 'jira', 'bug', 'report', 'customer', 'user'
]);


/**
 * Initializes the IndexedDB database.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            showMessage('Error opening database. Please check browser console.', 'error');
            reject('IndexedDB error');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB opened successfully');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('priority', 'priority', { unique: false });
                objectStore.createIndex('keywords', 'keywords', { unique: false, multiEntry: true });
                console.log('Object store and indexes created');
            }
        };
    });
}

/**
 * Displays a temporary message to the user in the main notification area.
 */
function showMessage(message, type = 'info', duration = 5000) {
    if (!mainNotificationArea) return;
    
    mainNotificationArea.textContent = message;
    mainNotificationArea.className = 'min-h-[3rem] w-full p-3 rounded-lg border flex items-center justify-center text-sm font-medium transition-colors duration-200'; // Reset

    if (type === 'success') {
        mainNotificationArea.classList.add('bg-teal-50', 'border-teal-200', 'text-teal-700');
    } else if (type === 'error') {
        mainNotificationArea.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
    } else { // 'info'
        mainNotificationArea.classList.add('bg-gray-50', 'border-gray-200', 'text-gray-600');
    }

    if (duration > 0) {
        setTimeout(() => {
            if (mainNotificationArea.textContent === message) {
                mainNotificationArea.textContent = 'No active messages.';
                mainNotificationArea.className = 'min-h-[3rem] w-full p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-sm font-medium text-gray-500 transition-colors duration-200';
            }
        }, duration);
    }
}


/**
 * Reads the content of a file as text, supporting .txt and .docx.
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        if (file.type === 'text/plain') {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (event) => reject(new Error(`Could not read text file: ${file.name}`));
            reader.readAsText(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            if (typeof mammoth === 'undefined') {
                return reject(new Error('Word document parsing library (Mammoth.js) is not available.'));
            }
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer: event.target.result });
                    resolve(result.value);
                } catch (error) {
                    reject(new Error(`Error processing Word document: ${file.name} - ${error.message}`));
                }
            };
            reader.onerror = (event) => reject(new Error(`Could not read Word document file: ${file.name}`));
            reader.readAsArrayBuffer(file);
        } else {
            reject(new Error(`Unsupported file type: ${file.name}. Please upload a .txt or .docx file.`));
        }
    });
}

/**
 * Deletes a document from IndexedDB by its ID.
 */
async function deleteDocument(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * --- UPDATED ---
 * Generates keywords locally using JavaScript.
 * This REPLACES the Python backend fetch call.
 */
async function generateKeywords(documentContent) {
    console.log("Generating keywords locally...");
    try {
        // 1. Clean and tokenize the text
        // - Convert to lowercase
        // - Remove possessives
        // - Match words that are 3+ characters long (avoids 'a', 'to', 'in' etc. partially)
        const words = documentContent
            .toLowerCase()
            .replace(/['’]s/g, '') // Remove possessive 's
            .match(/\b\w{3,}\b/g); // Get words 3+ chars, alphanumeric

        if (!words) {
            console.log("No words found after tokenizing.");
            return [];
        }

        // 2. Count frequencies, filtering out stopwords
        const freqMap = new Map();
        for (const word of words) {
            // Check if it's not a stopword and not a pure number
            if (!allStopWords.has(word) && isNaN(word)) {
                freqMap.set(word, (freqMap.get(word) || 0) + 1);
            }
        }

        // 3. Sort by frequency in descending order
        const sortedKeywords = Array.from(freqMap.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count (b[1] - a[1])
            .slice(0, 10); // Get the top 10 keywords

        // 4. Return just the keyword strings
        const finalKeywords = sortedKeywords.map(entry => entry[0]);
        console.log("Generated keywords:", finalKeywords);
        return finalKeywords;

    } catch (error) {
        console.error("Error generating keywords locally:", error);
        showMessage(`Failed to generate keywords: ${error.message}`, 'error', 0);
        return []; // Return empty array on failure
    }
}



/**
 * Adds a document to IndexedDB.
 */
async function addDocument(document) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.add(document);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Updates a document in IndexedDB.
 */
async function updateDocument(document) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.put(document);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Fetches all documents from IndexedDB.
 */
async function getAllDocuments() {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("IndexedDB not initialized."));
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}


/**
 * Renders the list of documents based on current filters.
 */
function renderDocuments(documentsToRender) {
    documentList.innerHTML = '';
    if (documentsToRender.length === 0) {
        // --- CHANGED colspan to 6 ---
        documentList.innerHTML = `<tr><td colspan="6" class="text-center text-gray-400 py-8">No matching documents found.</td></tr>`;
        return;
    }

    documentsToRender.forEach(doc => {
        const docRow = document.createElement('tr');
        docRow.className = "hover:bg-gray-50 transition";
        
        // --- UPDATED THIS TEMPLATE ---
        docRow.innerHTML = `
            <td><span class="doc-link" data-content="${encodeURIComponent(doc.content)}">${doc.name}</span></td>
            <td><span class="${'priority-' + doc.priority.toLowerCase()}">${doc.priority}</span></td>
            <td>${doc.startDate || 'N/A'}</td>
            <td>${doc.endDate || 'N/A'}</td>
            <td>${(doc.keywords && doc.keywords.length > 0) ? doc.keywords.map(kw => `<span class="badge-${doc.priority.toLowerCase()}">${kw}</span>`).join('') : '<span class="text-gray-400">N/A</span>'}</td>
            <td><span class="delete-btn" data-id="${doc.id}" data-name="${doc.name}"><i class="fa-solid fa-trash-can"></i></span></td>
        `;
        documentList.appendChild(docRow);
    });

    // Re-attach event listeners
    document.querySelectorAll('.doc-link').forEach(link => {
        link.addEventListener('click', () => {
            const content = decodeURIComponent(link.dataset.content);
            const docName = link.textContent.trim();
            showContentModal(content, docName);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const docId = parseInt(btn.dataset.id);
            const docName = btn.dataset.name;
            showConfirmModal(`Are you sure you want to delete "${docName}"?`, async () => {
                try {
                    await deleteDocument(docId);
                    showMessage('Document deleted successfully!', 'success');
                     refreshDocumentList();
                } catch (error) {
                     showMessage(`Failed to delete document: ${error.message}`, 'error');
                }
            });
        });
    });
}



/**
 * Populates the keyword filter dropdown with unique keywords.
 */
function populateKeywordFilter() {
    const allKeywords = new Set(allDocuments.flatMap(doc => doc.keywords || []));
    keywordFilter.innerHTML = '<option value="">Filter by Keyword</option>';
    Array.from(allKeywords).sort().forEach(keyword => {
        keywordFilter.innerHTML += `<option value="${keyword}">${keyword}</option>`;
    });
    keywordFilter.value = currentKeywordFilter;
}

/**
 * Applies filters and re-renders the document list.
 */
function applyFilters() {
    let filteredDocs = [...allDocuments];
    if (currentPriorityFilter !== 'all') {
        filteredDocs = filteredDocs.filter(doc => doc.priority === currentPriorityFilter);
    }
    if (currentKeywordFilter) {
        filteredDocs = filteredDocs.filter(doc => doc.keywords && doc.keywords.includes(currentKeywordFilter));
    }
    renderDocuments(filteredDocs);
}

/**
 * Fetches all documents, updates cache, populates filters, and renders.
 */
async function refreshDocumentList() {
    try {
        allDocuments = await getAllDocuments();
        populateKeywordFilter();
        applyFilters();
    } catch (error) {
        console.error("Failed to refresh document list:", error);
        showMessage('Failed to load documents.', 'error', 0);
    }
}

/**
 * Shows a modal with the document content.
 */
function showContentModal(content, docName) {
    const modalId = 'contentModal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50" role="dialog" aria-modal="true">
            <div class="modal-content-area relative w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900 truncate pr-8" title="${docName}">${docName}</h3>
                    <button type="button" class="close-modal-btn text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center">
                        <i class="fa-solid fa-xmark text-lg"></i><span class="sr-only">Close modal</span>
                    </button>
                </div>
                <div class="p-4 md:p-5 space-y-4 overflow-y-auto flex-grow">
                    <pre class="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">${content}</pre>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById(modalId);
    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.target === modal && closeModal());
}

/**
 * Shows a confirmation modal.
 */
function showConfirmModal(message, onConfirm) {
    const modalId = 'confirmModal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50" role="dialog" aria-modal="true">
            <div class="modal-content-area relative p-6 text-center max-w-md w-full">
                <button type="button" class="close-modal-btn absolute top-3 end-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center">
                    <i class="fa-solid fa-xmark text-lg"></i><span class="sr-only">Close modal</span>
                </button>
                <div class="w-12 h-12 rounded-full bg-red-100 p-2 flex items-center justify-center mx-auto mb-4">
                    <i class="fa-solid fa-trash-can text-red-500 text-xl"></i>
                </div>
                <h3 class="mb-5 text-lg font-normal text-gray-600">${message}</h3>
                <button id="confirmYes" type="button" class="text-white bg-red-600 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm inline-flex items-center px-5 py-2.5 text-center">
                    Yes, I'm sure
                </button>
                <button id="confirmNo" type="button" class="py-2.5 px-5 ms-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-teal-700 focus:z-10 focus:ring-gray-100">
                    No, cancel
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById(modalId);
    const closeModal = () => modal.remove();

    document.getElementById('confirmYes').addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
    document.getElementById('confirmNo').addEventListener('click', closeModal);
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => e.target === modal && closeModal());
}

/**
 * Shows the priority review modal.
 */
function showPriorityReviewModal(files) {
    modalFilesList.innerHTML = '';
    modalErrorMessage.classList.add('hidden');
    priorityReviewModal.classList.remove('hidden');
    priorityReviewModal.style.display = 'flex';

    filesToUpload = files.map((file, index) => {
        let detectedPriority = '';
        if (/P1/i.test(file.name) && !/P2/i.test(file.name) && !/P3/i.test(file.name)) detectedPriority = 'P1';
        else if (/P2/i.test(file.name) && !/P1/i.test(file.name) && !/P3/i.test(file.name)) detectedPriority = 'P2';
        else if (/P3/i.test(file.name) && !/P1/i.test(file.name) && !/P2/i.test(file.name)) detectedPriority = 'P3';

        const fileEntryDiv = document.createElement('div');
        fileEntryDiv.className = `file-entry ${!detectedPriority ? 'highlight-warning' : ''}`;
        fileEntryDiv.innerHTML = `
            <span class="file-name" title="${file.name}">${file.name}</span>
            <select data-file-index="${index}" class="file-priority-select block w-40 text-sm p-2 border rounded-lg shadow-sm transition bg-white border-gray-300 focus:border-teal-500 focus:ring-teal-500">
                <option value="" disabled ${!detectedPriority ? 'selected' : ''}>Select Priority</option>
                <option value="P1" ${detectedPriority === 'P1' ? 'selected' : ''}>P1 (Critical)</option>
                <option value="P2" ${detectedPriority === 'P2' ? 'selected' : ''}>P2 (Normal)</option>
                <option value="P3" ${detectedPriority === 'P3' ? 'selected' : ''}>P3 (Low)</option>
            </select>
        `;
        modalFilesList.appendChild(fileEntryDiv);

        return { file: file, priority: detectedPriority, originalIndex: index };
    });

    // Attach change listeners after creating all elements
    document.querySelectorAll('.file-priority-select').forEach(select => {
        select.addEventListener('change', (event) => {
            const idx = parseInt(event.target.dataset.fileIndex);
            if (filesToUpload[idx]) {
                filesToUpload[idx].priority = event.target.value;
                event.target.closest('.file-entry').classList.remove('highlight-warning');
                modalErrorMessage.classList.add('hidden');
            }
        });
    });
}


/**
 * Extracts Start Date and End Date from document content using Regex.
 * This is the NEW, more robust version.
 */
function extractDates(content) {
    // This regex is more flexible:
    // \s* -> matches any whitespace (spaces, tabs, newlines)
    // [:]?    -> matches an optional colon
    // (\d{2}[-/]\d{2}[-/]\d{4}) -> captures DD-MM-YYYY or DD/MM/YYYY
    const startRegex = /Start Date\s*[:]?\s*(\d{2}[-/]\d{2}[-/]\d{4})/;
    const endRegex = /End Date\s*[:]?\s*(\d{2}[-/]\d{2}[-/]\d{4})/;

    const startMatch = content.match(startRegex);
    const endMatch = content.match(endRegex);

    // Get the captured group (the date) or return 'N/A' if not found
    const startDate = startMatch ? startMatch[1] : 'N/A';
    const endDate = endMatch ? endMatch[1] : 'N/A';

    // ---!! DEBUGGING LINE !!---
    // This will help us see what's happening in the browser's console.
    console.log('--- Date Extraction Debug ---');
    console.log('Start Date Found:', startDate, '| Match object:', startMatch);
    console.log('End Date Found:', endDate, '| Match object:', endMatch);
    // console.log('Full Content Scanned:', content.substring(0, 500)); // Uncomment this line if you need to see the raw text

    return { startDate, endDate };
}



/**
 * Hides the priority review modal.
 */
function hidePriorityReviewModal() {
    priorityReviewModal.classList.add('hidden');
    modalFilesList.innerHTML = '';
    hiddenFileInput.value = '';
    filesToUpload = [];
}

// --- INITIALIZATION LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    // Assign DOM elements
    mainNotificationArea = document.getElementById('mainNotificationArea');
    documentList = document.getElementById('documentList');
    keywordFilter = document.getElementById('keywordFilter');
    resetFiltersButton = document.getElementById('resetFiltersButton');
    hiddenFileInput = document.getElementById('hiddenFileInput');
    priorityReviewModal = document.getElementById('priorityReviewModal');
    modalFilesList = document.getElementById('modalFilesList');
    modalErrorMessage = document.getElementById('modalErrorMessage');
    confirmUploadModalBtn = document.getElementById('confirmUploadModalBtn');
    cancelUploadModalBtn = document.getElementById('cancelUploadModalBtn');
    dropZone = document.querySelector('.drop-zone');

    // Initialize the database
    try {
        await initDB();
        refreshDocumentList();
        showMessage('Application loaded successfully.', 'info', 3000);
    } catch (error) {
        console.error("Critical error during database initialization:", error);
        showMessage("Application failed to start: " + error.message, 'error', 0);
    }

    // --- Event Listeners ---

    // File selection logic (click and drag/drop)
    const handleFiles = (files) => {
        const selectedFiles = Array.from(files);
        if (selectedFiles.length > 0) {
            showPriorityReviewModal(selectedFiles);
        }
    };

    hiddenFileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // 'Confirm & Upload' button inside the modal
    confirmUploadModalBtn.addEventListener('click', async () => {
        const isValidationPassed = filesToUpload.every(item => item.priority);
        if (!isValidationPassed) {
            modalErrorMessage.textContent = 'Please select a priority (P1, P2, or P3) for all files.';
            modalErrorMessage.classList.remove('hidden');
            return;
        }


    
        const filesToProcess = [...filesToUpload];
        hidePriorityReviewModal();
        
        document.getElementById('uploadLoader').classList.remove('hidden');
        showMessage(`Processing ${filesToProcess.length} document(s)...`, 'info', 0);

        let successfulUploads = 0, failedUploads = 0;

        for (const item of filesToProcess) {
            try {
                const content = await readFileContent(item.file);
                
                // Extract dates from the content
                const { startDate, endDate } = extractDates(content);

                const newDocument = {
                    name: item.file.name,
                    priority: item.priority,
                    content: content,
                    startDate: startDate, // ADDED
                    endDate: endDate,     // ADDED
                    keywords: [],
                    uploadDate: new Date().toISOString()
                };

                const docId = await addDocument(newDocument);
                newDocument.id = docId;
                
                // --- THIS WILL NOW CALL THE JS FUNCTION ---
                const generatedKeywords = await generateKeywords(content);
                newDocument.keywords = generatedKeywords;
                
                await updateDocument(newDocument);
                successfulUploads++;
            } catch (error) {
                console.error(`FAILED TO PROCESS FILE: ${item.file.name}`, error);
                failedUploads++;
            }
        }

        document.getElementById('uploadLoader').classList.add('hidden');
        if (failedUploads === 0) {
            showMessage(`Successfully uploaded ${successfulUploads} document(s)!`, 'success');
        } else {
            showMessage(`Uploaded ${successfulUploads} of ${filesToProcess.length} documents. ${failedUploads} failed.`, 'error', 0);
        }
        refreshDocumentList();
    });

    // Modal close/cancel buttons
    cancelUploadModalBtn.addEventListener('click', hidePriorityReviewModal);
    priorityReviewModal.querySelector('.modal-close-btn-x').addEventListener('click', hidePriorityReviewModal);
    priorityReviewModal.addEventListener('click', (e) => e.target === priorityReviewModal && hidePriorityReviewModal());

    // Sorting by name
    document.getElementById("sortNameTh").addEventListener('click', () => {
        sortAsc = !sortAsc;
        allDocuments.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (nameA < nameB) return sortAsc ? -1 : 1;
            if (nameA > nameB) return sortAsc ? 1 : -1;
            return 0;
        });
        document.getElementById('sortNameIcon').className = `fa-solid ${sortAsc ? 'fa-arrow-down-a-z' : 'fa-arrow-up-z-a'} ml-1`;
        applyFilters();
    });

    // Filter listeners
    document.querySelectorAll('input[name="priorityFilter"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentPriorityFilter = e.target.value;
            applyFilters();
        });
    });

    keywordFilter.addEventListener('change', (e) => {
        currentKeywordFilter = e.target.value;
        applyFilters();
    });

    resetFiltersButton.addEventListener('click', () => {
        document.getElementById('filterAll').checked = true;
        keywordFilter.value = '';
        currentPriorityFilter = 'all';
        currentKeywordFilter = '';
        applyFilters();
    });
});
