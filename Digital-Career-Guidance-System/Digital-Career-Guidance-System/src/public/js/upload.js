let currentUploadId = null;
let extractedSubjects = [];
let editingIndex = null;

// Drag and Drop
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
});

uploadZone.addEventListener('click', () => {
    if (!uploadZone.classList.contains('uploading')) {
        fileInput.click();
    }
});

function handleFileSelect(e) {
    if (e.target.files.length) handleFile(e.target.files[0]);
}

function handleFile(file) {
    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        showFlash('Invalid file type. Please upload PDF, JPG, or PNG.', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showFlash('File too large. Maximum size is 10MB.', 'error');
        return;
    }
    
    // Show selected state
    document.getElementById('upload-prompt').classList.add('hidden');
    document.getElementById('file-selected').classList.remove('hidden');
    document.getElementById('filename').textContent = file.name;
    uploadZone.dataset.file = file;
}

function resetUpload() {
    document.getElementById('upload-prompt').classList.remove('hidden');
    document.getElementById('file-selected').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('file-input').value = '';
    delete uploadZone.dataset.file;
    currentUploadId = null;
    extractedSubjects = [];
}

async function uploadFile() {
    const file = uploadZone.dataset.file;
    if (!file) return;
    
    const formData = new FormData();
    formData.append('reportCard', file);
    
    document.getElementById('upload-progress').classList.remove('hidden');
    uploadZone.classList.add('uploading');
    
    try {
        const response = await fetch('/api/results/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRF-Token': getCsrfToken()
            },
            credentials: 'same-origin'
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Upload failed');
        
        currentUploadId = data.uploadId;
        showFlash('File uploaded! Processing...', 'success');
        
        // Poll for status
        pollStatus(data.uploadId);
        
    } catch (error) {
        showFlash(error.message, 'error');
        document.getElementById('upload-progress').classList.add('hidden');
        uploadZone.classList.remove('uploading');
    }
}

async function pollStatus(uploadId) {
    try {
        const data = await api.get(`/api/results/status/${uploadId}`);
        
        if (data.status === 'processing') {
            setTimeout(() => pollStatus(uploadId), 2000);
        } else if (data.status === 'completed') {
            document.getElementById('upload-progress').classList.add('hidden');
            uploadZone.classList.remove('uploading');
            displayResults(data);
        } else if (data.status === 'failed') {
            throw new Error(data.error || 'Processing failed');
        }
    } catch (error) {
        document.getElementById('upload-progress').classList.add('hidden');
        uploadZone.classList.remove('uploading');
        showFlash(error.message, 'error');
    }
}

function displayResults(data) {
    extractedSubjects = data.subjects || [];
    document.getElementById('aps-score').textContent = data.apsScore || '-';
    renderTable();
    document.getElementById('results-section').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

function renderTable() {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    
    extractedSubjects.forEach((subject, index) => {
        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-900">${subject.subject}</td>
            <td class="px-6 py-4">${subject.mark}%</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${getLevelColor(subject.level)}">
                    Level ${subject.level}
                </span>
            </td>
            <td class="px-6 py-4 font-medium text-indigo-600">+${subject.aps_points}</td>
            <td class="px-6 py-4">
                <button onclick="editSubject(${index})" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                <button onclick="deleteSubject(${index})" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function getLevelColor(level) {
    if (level >= 6) return 'bg-green-100 text-green-800';
    if (level >= 4) return 'bg-blue-100 text-blue-800';
    return 'bg-yellow-100 text-yellow-800';
}

function editSubject(index) {
    editingIndex = index;
    const subject = extractedSubjects[index];
    document.getElementById('edit-subject-name').value = subject.subject;
    document.getElementById('edit-subject-mark').value = subject.mark;
    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    editingIndex = null;
}

function saveSubjectEdit() {
    if (editingIndex === null) return;
    
    const name = document.getElementById('edit-subject-name').value;
    const mark = parseInt(document.getElementById('edit-subject-mark').value);
    
    if (!name || isNaN(mark) || mark < 0 || mark > 100) {
        showFlash('Please enter valid subject name and mark (0-100)', 'error');
        return;
    }
    
    // Recalculate level and APS
    const level = calculateLevel(mark);
    const aps_points = [0, 1, 2, 3, 4, 5, 6, 7][level] || 0;
    
    extractedSubjects[editingIndex] = {
        ...extractedSubjects[editingIndex],
        subject: name,
        mark,
        level,
        aps_points
    };
    
    // Recalculate total APS
    const apsScore = extractedSubjects
        .sort((a, b) => b.aps_points - a.aps_points)
        .slice(0, 6)
        .reduce((sum, s) => sum + s.aps_points, 0);
    
    document.getElementById('aps-score').textContent = apsScore;
    
    renderTable();
    closeEditModal();
    showFlash('Subject updated', 'success');
}

function deleteSubject(index) {
    if (confirm('Are you sure you want to remove this subject?')) {
        extractedSubjects.splice(index, 1);
        renderTable();
    }
}

function addSubject() {
    const name = prompt('Enter subject name:');
    if (!name) return;
    
    const mark = prompt('Enter mark (0-100):');
    if (!mark || isNaN(mark)) return;
    
    const markNum = parseInt(mark);
    const level = calculateLevel(markNum);
    
    extractedSubjects.push({
        subject: name,
        mark: markNum,
        level,
        aps_points: [0, 1, 2, 3, 4, 5, 6, 7][level] || 0
    });
    
    renderTable();
}

function calculateLevel(mark) {
    if (mark >= 80) return 7;
    if (mark >= 70) return 6;
    if (mark >= 60) return 5;
    if (mark >= 50) return 4;
    if (mark >= 40) return 3;
    if (mark >= 30) return 2;
    return 1;
}

async function confirmResults() {
    if (extractedSubjects.length < 5) {
        showFlash('Please add at least 5 subjects', 'error');
        return;
    }
    
    const btn = document.getElementById('confirm-btn');
    btn.disabled = true;
    btn.innerHTML = 'Saving...';
    
    try {
        await api.post('/api/results/confirm', {
            subjects: extractedSubjects,
            uploadId: currentUploadId
        });
        
        showFlash('Results saved successfully!', 'success');
        setTimeout(() => window.location.href = '/dashboard', 1000);
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = 'Confirm & Save';
    }
}
