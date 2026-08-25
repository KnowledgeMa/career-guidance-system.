async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const spinner = document.getElementById('login-spinner');
    const form = e.target;
    
    btn.disabled = true;
    spinner.classList.remove('hidden');
    
    try {
        const data = await api.post('/api/auth/login', {
            email: form.email.value,
            password: form.password.value
        });
        
        showFlash('Login successful! Redirecting...', 'success');
        setTimeout(() => window.location.href = '/dashboard', 500);
    } catch (error) {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const form = e.target;
    
    btn.disabled = true;
    btn.innerHTML = 'Creating Account...';
    
    try {
        const data = await api.post('/api/auth/register', {
            email: form.email.value,
            password: form.password.value,
            firstName: form.firstName.value,
            lastName: form.lastName.value,
            grade: form.grade.value,
            school: form.school.value,
            province: form.province.value,
            role: 'student'
        });
        
        showFlash('Account created! Redirecting...', 'success');
        setTimeout(() => window.location.href = '/dashboard', 500);
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = 'Create Account';
    }
}
