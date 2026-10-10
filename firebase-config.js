/* ==================================================================
   MEDINEXUS PRO — Firebase Cloud Engine & Firestore Architecture
   ================================================================== */

(function () {
    'use strict';

    // The Exact Firebase Configuration Matrix Provided
    const firebaseConfig = {
        apiKey: "AIzaSyCd6qs1X8nkcU7Vao9F8Q5qUHXNJ9Bqv7k",
        authDomain: "qre7-f3a35.firebaseapp.com",
        projectId: "qre7-f3a35",
        storageBucket: "qre7-f3a35.appspot.com",
        messagingSenderId: "499634279817",
        appId: "1:499634279817:web:2c9d369e6576ece0b8ffd58",
        measurementId: "G-1SFLXN0RCP"
    };

    let fbApp = null;
    let fbDb = null;
    let fbAuth = null;
    let isCloudReady = false;

    // Database Collections Schemas
    const COLL_USERS = 'users';           // { uid, name, role, phone, username, isActive, subPassword }
    const COLL_TREATMENTS = 'treatments'; // { id, name, defaultPrice, createdAt }
    const COLL_SESSIONS = 'sessions';     // { id, doctorId, doctorName, patientName, patientPhone, treatmentName, finalPrice, session1Date, session2Date }
    const COLL_FINANCES = 'finances';     // { dailyTotal, monthlyTotal, lastResetDate }
    const COLL_DEBTS = 'debts';           // { id, patientName, patientPhone, remainingAmount, createdAt }

    // Status Indicator Dispatcher
    function updateStatusIndicator(status, text) {
        try {
            const el = document.getElementById('fb-status');
            const txt = document.getElementById('fb-status-text');
            if (el && txt) {
                el.className = `fb-status ${status}`;
                txt.textContent = text;
            }
        } catch (e) {}
    }

    // Initialize Firebase SDK with Offline Persistence
    try {
        if (typeof firebase !== 'undefined' && firebase.initializeApp) {
            fbApp = firebase.initializeApp(firebaseConfig);
            fbDb = firebase.firestore();
            fbAuth = firebase.auth();

            // Enable Multi-Tab Offline Cache Persistence
            fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
                if (err.code === 'failed-precondition') {
                    console.warn('[Firebase] Persistence failed: Multiple tabs open');
                } else if (err.code === 'unimplemented') {
                    console.warn('[Firebase] Browser does not support persistence');
                }
            });

            isCloudReady = true;
            updateStatusIndicator('online', 'CONNECTED');
            console.log('%c🩺 MEDINEXUS Firebase Cloud Engine Active', 'color:#00F0FF;font-weight:bold');
        } else {
            throw new Error('Firebase SDK Not Loaded');
        }
    } catch (err) {
        console.warn('⚠️ Cloud engine fallback engaged:', err.message);
        isCloudReady = false;
        updateStatusIndicator('offline', 'LOCAL_MOCK');
    }

    // Silent Anonymous Authentication for Client Security
    async function ensureAuth() {
        if (!isCloudReady || !fbAuth) return false;
        try {
            if (!fbAuth.currentUser) {
                await fbAuth.signInAnonymously();
            }
            return true;
        } catch (e) {
            console.warn('[Auth] Anonymous session fallback active');
            return false;
        }
    }

    // Seed Initial Financial Record & Default Treatments if empty
    async function initializeSystemSeed() {
        if (!isCloudReady || !fbDb) return;
        try {
            await ensureAuth();

            // 1. Finances Document
            const finRef = fbDb.collection(COLL_FINANCES).doc('summary');
            const finSnap = await finRef.get();
            if (!finSnap.exists) {
                await finRef.set({
                    dailyTotal: 0,
                    monthlyTotal: 0,
                    lastResetDate: new Date().toISOString()
                });
            }

            // 2. Default Treatments Catalog
            const trtSnap = await fbDb.collection(COLL_TREATMENTS).limit(1).get();
            if (trtSnap.empty) {
                const defaultTreatments = [
                    { id: 'trt_1', name: 'كشف واستشارة طبية عامة', defaultPrice: 15000, createdAt: new Date().toISOString() },
                    { id: 'trt_2', name: 'تنظيف وتبييض الأسنان', defaultPrice: 35000, createdAt: new Date().toISOString() },
                    { id: 'trt_3', name: 'حشوة تجميلية كمبوزيت', defaultPrice: 30000, createdAt: new Date().toISOString() },
                    { id: 'trt_4', name: 'علاج جذور وسحب عصب', defaultPrice: 60000, createdAt: new Date().toISOString() },
                    { id: 'trt_5', name: 'جلسة تقويم شهري', defaultPrice: 50000, createdAt: new Date().toISOString() }
                ];
                const batch = fbDb.batch();
                defaultTreatments.forEach(t => {
                    batch.set(fbDb.collection(COLL_TREATMENTS).doc(t.id), t);
                });
                await batch.commit();
            }
        } catch (e) {
            console.warn('Silent boundary in seed initialization:', e);
        }
    }

    // ==================== REAL-TIME LISTENERS & OPERATIONS ====================

    // Financial Listeners & Settlement Transfer
    function subscribeFinances(callback) {
        if (!isCloudReady || !fbDb) {
            const local = JSON.parse(localStorage.getItem('medinexus_finances') || '{"dailyTotal":0,"monthlyTotal":0}');
            callback(local);
            return () => {};
        }

        return fbDb.collection(COLL_FINANCES).doc('summary').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                localStorage.setItem('medinexus_finances', JSON.stringify(data));
                callback(data);
                updateStatusIndicator('online', 'LIVE');
            }
        }, err => {
            console.error('Finances subscription error:', err);
        });
    }

    async function transferDailyRevenueCloud(currentDaily, currentMonthly) {
        updateStatusIndicator('sync', 'TRANSFERRING');
        const newMonthly = Number(currentMonthly || 0) + Number(currentDaily || 0);

        if (isCloudReady && fbDb) {
            try {
                await ensureAuth();
                await fbDb.collection(COLL_FINANCES).doc('summary').update({
                    dailyTotal: 0,
                    monthlyTotal: newMonthly,
                    lastResetDate: new Date().toISOString()
                });
                updateStatusIndicator('online', 'LIVE');
                return true;
            } catch (e) {
                console.error('Cloud transfer error:', e);
            }
        }

        // Local Fallback
        const fallback = { dailyTotal: 0, monthlyTotal: newMonthly, lastResetDate: new Date().toISOString() };
        localStorage.setItem('medinexus_finances', JSON.stringify(fallback));
        updateStatusIndicator('online', 'LOCAL');
        return true;
    }

    // Treatments Catalog Subscriptions & CRUD
    function subscribeTreatments(callback) {
        if (!isCloudReady || !fbDb) {
            const local = JSON.parse(localStorage.getItem('medinexus_treatments') || '[]');
            callback(local);
            return () => {};
        }

        return fbDb.collection(COLL_TREATMENTS).orderBy('name').onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('medinexus_treatments', JSON.stringify(list));
            callback(list);
        });
    }

    async function addTreatmentCloud(name, defaultPrice) {
        const id = 'trt_' + Date.now().toString(36);
        const item = {
            id,
            name: String(name).trim(),
            defaultPrice: Number(defaultPrice) || 0,
            createdAt: new Date().toISOString()
        };

        if (isCloudReady && fbDb) {
            await ensureAuth();
            await fbDb.collection(COLL_TREATMENTS).doc(id).set(item);
            return item;
        }

        const local = JSON.parse(localStorage.getItem('medinexus_treatments') || '[]');
        local.push(item);
        localStorage.setItem('medinexus_treatments', JSON.stringify(local));
        return item;
    }

    async function deleteTreatmentCloud(id) {
        if (isCloudReady && fbDb) {
            await ensureAuth();
            await fbDb.collection(COLL_TREATMENTS).doc(id).delete();
            return true;
        }

        let local = JSON.parse(localStorage.getItem('medinexus_treatments') || '[]');
        local = local.filter(t => t.id !== id);
        localStorage.setItem('medinexus_treatments', JSON.stringify(local));
        return true;
    }

    // Doctors Subscriptions & Session Freeze Switch
    function subscribeDoctors(callback) {
        if (!isCloudReady || !fbDb) {
            const local = JSON.parse(localStorage.getItem('medinexus_doctors') || '[]');
            callback(local);
            return () => {};
        }

        return fbDb.collection(COLL_USERS).where('role', '==', 'doctor').onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('medinexus_doctors', JSON.stringify(list));
            callback(list);
        });
    }

    async function addDoctorCloud(name, phone, username, subPassword) {
        const uid = 'doc_' + Date.now().toString(36);
        const doctorData = {
            uid,
            name: String(name).trim(),
            phone: String(phone).trim(),
            username: String(username).trim().toLowerCase(),
            subPassword: String(subPassword).trim(),
            role: 'doctor',
            isActive: true, // Default: session active
            createdAt: new Date().toISOString()
        };

        if (isCloudReady && fbDb) {
            await ensureAuth();
            // Verify username uniqueness
            const check = await fbDb.collection(COLL_USERS).where('username', '==', doctorData.username).get();
            if (!check.empty) {
                throw new Error('اسم المستخدم مسجل مسبقاً لطبيب آخر!');
            }
            await fbDb.collection(COLL_USERS).doc(uid).set(doctorData);
            return doctorData;
        }

        const local = JSON.parse(localStorage.getItem('medinexus_doctors') || '[]');
        local.push(doctorData);
        localStorage.setItem('medinexus_doctors', JSON.stringify(local));
        return doctorData;
    }

    // Session Kill / Freeze Switch
    async function toggleDoctorSessionStatus(doctorId, currentStatus) {
        const newStatus = !currentStatus; // toggle boolean
        if (isCloudReady && fbDb) {
            await ensureAuth();
            await fbDb.collection(COLL_USERS).doc(doctorId).update({
                isActive: newStatus
            });
            return newStatus;
        }

        const local = JSON.parse(localStorage.getItem('medinexus_doctors') || '[]');
        const doc = local.find(d => d.uid === doctorId || d.id === doctorId);
        if (doc) doc.isActive = newStatus;
        localStorage.setItem('medinexus_doctors', JSON.stringify(local));
        return newStatus;
    }

    // Sessions Subscriptions & Record Creation
    function subscribeSessions(callback) {
        if (!isCloudReady || !fbDb) {
            const local = JSON.parse(localStorage.getItem('medinexus_sessions') || '[]');
            callback(local);
            return () => {};
        }

        return fbDb.collection(COLL_SESSIONS).orderBy('createdAt', 'desc').onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('medinexus_sessions', JSON.stringify(list));
            callback(list);
        });
    }

    async function recordPatientSessionCloud(sessionData) {
        updateStatusIndicator('sync', 'SAVING');
        const id = 'sess_' + Date.now().toString(36);
        const fullSession = {
            id,
            ...sessionData,
            createdAt: new Date().toISOString()
        };

        if (isCloudReady && fbDb) {
            await ensureAuth();
            const batch = fbDb.batch();

            // 1. Add session record
            batch.set(fbDb.collection(COLL_SESSIONS).doc(id), fullSession);

            // 2. Increment Daily Revenue in summary
            const finRef = fbDb.collection(COLL_FINANCES).doc('summary');
            batch.set(finRef, {
                dailyTotal: firebase.firestore.FieldValue.increment(Number(sessionData.finalPrice) || 0)
            }, { merge: true });

            await batch.commit();
            updateStatusIndicator('online', 'LIVE');
            return fullSession;
        }

        // Local Storage Fallback
        const localSessions = JSON.parse(localStorage.getItem('medinexus_sessions') || '[]');
        localSessions.unshift(fullSession);
        localStorage.setItem('medinexus_sessions', JSON.stringify(localSessions));

        const localFin = JSON.parse(localStorage.getItem('medinexus_finances') || '{"dailyTotal":0,"monthlyTotal":0}');
        localFin.dailyTotal = (Number(localFin.dailyTotal) || 0) + (Number(sessionData.finalPrice) || 0);
        localStorage.setItem('medinexus_finances', JSON.stringify(localFin));

        updateStatusIndicator('online', 'LOCAL');
        return fullSession;
    }

    // Debts Registry Subscriptions & CRUD
    function subscribeDebts(callback) {
        if (!isCloudReady || !fbDb) {
            const local = JSON.parse(localStorage.getItem('medinexus_debts') || '[]');
            callback(local);
            return () => {};
        }

        return fbDb.collection(COLL_DEBTS).orderBy('createdAt', 'desc').onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('medinexus_debts', JSON.stringify(list));
            callback(list);
        });
    }

    async function addDebtCloud(patientName, patientPhone, remainingAmount) {
        const id = 'debt_' + Date.now().toString(36);
        const debtRecord = {
            id,
            patientName: String(patientName).trim(),
            patientPhone: String(patientPhone).trim(),
            remainingAmount: Number(remainingAmount) || 0,
            status: 'unpaid',
            createdAt: new Date().toISOString()
        };

        if (isCloudReady && fbDb) {
            await ensureAuth();
            await fbDb.collection(COLL_DEBTS).doc(id).set(debtRecord);
            return debtRecord;
        }

        const local = JSON.parse(localStorage.getItem('medinexus_debts') || '[]');
        local.unshift(debtRecord);
        localStorage.setItem('medinexus_debts', JSON.stringify(local));
        return debtRecord;
    }

    async function payDebtCloud(id, amountPaid, currentRemaining) {
        const newRem = Math.max(0, currentRemaining - amountPaid);
        const newStatus = newRem === 0 ? 'paid' : 'partial';

        if (isCloudReady && fbDb) {
            await ensureAuth();
            const batch = fbDb.batch();

            batch.update(fbDb.collection(COLL_DEBTS).doc(id), {
                remainingAmount: newRem,
                status: newStatus
            });

            // Add collected debt payment to daily revenue
            const finRef = fbDb.collection(COLL_FINANCES).doc('summary');
            batch.set(finRef, {
                dailyTotal: firebase.firestore.FieldValue.increment(Number(amountPaid) || 0)
            }, { merge: true });

            await batch.commit();
            return true;
        }

        const local = JSON.parse(localStorage.getItem('medinexus_debts') || '[]');
        const d = local.find(x => x.id === id);
        if (d) {
            d.remainingAmount = newRem;
            d.status = newStatus;
        }
        localStorage.setItem('medinexus_debts', JSON.stringify(local));
        return true;
    }

    // Public Firebase Engine Interface
    window.MedicalFirebase = {
        init: async function () {
            await ensureAuth();
            await initializeSystemSeed();
        },
        isReady: () => isCloudReady,
        subscribeFinances,
        transferDailyRevenueCloud,
        subscribeTreatments,
        addTreatmentCloud,
        deleteTreatmentCloud,
        subscribeDoctors,
        addDoctorCloud,
        toggleDoctorSessionStatus,
        subscribeSessions,
        recordPatientSessionCloud,
        subscribeDebts,
        addDebtCloud,
        payDebtCloud,
        updateStatusIndicator
    };
})();
