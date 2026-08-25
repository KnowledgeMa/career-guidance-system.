const { query } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function seedAdmin() {
    try {
        console.log('🌱 Seeding admin user...');

        // Admin credentials
        const adminEmail = 'admin@dcgs.com';
        const adminPassword = 'admin123';
        const adminRole = 'superadmin';

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

        // Check if admin already exists
        const existingAdmin = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);

        if (existingAdmin.rows.length > 0) {
            console.log('✅ Admin user already exists');
            return;
        }

        // Insert admin user
        const result = await query(`
            INSERT INTO users (email, password_hash, role, email_verified, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, email, role
        `, [adminEmail, passwordHash, adminRole, true]);

        console.log('✅ Admin user created successfully!');
        console.log('📧 Email:', adminEmail);
        console.log('🔑 Password:', adminPassword);
        console.log('👤 Role:', adminRole);
        console.log('🔗 Access admin portal at: /admin/dashboard');

    } catch (error) {
        console.error('❌ Error seeding admin:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

seedAdmin();