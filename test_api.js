async function test() {
    try {
        console.log("=== Testing Admin ===");
        const adminRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@test.com', password: 'password123' })
        });
        const adminData = await adminRes.json();
        const adminToken = adminData.token;
        console.log("Admin logged in", adminRes.status);

        try {
            const adminDash = await fetch('http://localhost:5000/api/dashboard', {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log("Admin Dashboard Response:", await adminDash.json());
        } catch (e) {
            console.error("Admin Dash Error:", e);
        }

        try {
            const adminMembers = await fetch('http://localhost:5000/api/members', {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            const mems = await adminMembers.json();
            console.log("Admin Members Count:", mems.length);
        } catch (e) {
            console.error("Admin Members Error:", e);
        }

        console.log("\n=== Testing Member ===");
        const memberRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'member@test.com', password: 'password123' })
        });
        const memberData = await memberRes.json();
        const memberToken = memberData.token;
        console.log("Member logged in", memberRes.status);

        try {
            const memberDash = await fetch('http://localhost:5000/api/dashboard', {
                headers: { Authorization: `Bearer ${memberToken}` }
            });
            console.log("Member Dashboard Response:", await memberDash.json());
        } catch (e) {
            console.error("Member Dash Error:", e);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

test();
