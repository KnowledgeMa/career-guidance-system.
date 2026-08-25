// Dashboard specific interactivity
document.addEventListener('DOMContentLoaded', () => {
    // Animate progress bar on load
    const progressBar = document.querySelector('.bg-indigo-600');
    if (progressBar) {
        const width = progressBar.style.width;
        progressBar.style.width = '0%';
        setTimeout(() => {
            progressBar.style.width = width;
        }, 300);
    }
});
