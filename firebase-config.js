/* ==================================================================
   MEDINEXUS PRO — Enterprise Real-Time Cloud Engine & Data Security
   ================================================================== */

(function () {
    'use strict';

    // The Exact Production Firebase Configuration
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

    // Standardized Collection Names
    const COLL_USERS = 'users';           // { uid, name, role, phone, username, subPassword, isActive }
    const COLL_TREATMENTS = 'treatments'; // { id, name, defaultPrice, stock, consumed, createdAt }
    const COLL_SESSIONS = 'sessions';     // { id, doctorId, doctorName, patientName, patientPhone, treatmentName, finalPrice, session1Date, session2Date }
    const COLL_FINANCES = 'finances';     // { dailyTotal, monthlyTotal, lastResetDate }
    const COLL_DEBTS = 'debts';           // { id, patientName, patientPhone, remainingAmount, createdAt }
    const COLL_ACTIVITIES = 'activities'; // { id, type, title, details, user, role, timestamp }
    const COLL_CONSUMED_LOGS = 'consumed_logs'; // { id, treatmentId, treatmentName, doctorId, doctorName, qty, timestamp }

    // Sanitize string against XSS / injection attacks
    function cleanInput(str) {
        if (!str) return '';
        return String(str).replace(/[<>]/g, '').trim();
    }

    // Status Indicator
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

    // Initialize Firebase SDK
    try {
        if (typeof firebase !== 'undefined' && firebase.initializeApp) {
            fbApp = firebase.initializeApp(firebaseConfig);
            fbDb = firebase.firestore();
            fbAuth = firebase.auth();

            fbDb.settings({
                cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
                merge: true
            });

            isCloudReady = true;
            updateStatusIndicator('online', 'CONNECTED');
            console.log('%c🔥 Firebase Firestore Cloud Engine Ready (Secure)', 'color:#00F0FF;font-weight:bold');
        } else {
            throw new Error('Firebase SDK is not loaded.');
        }
    } catch (err) {
        console.error('❌ Firebase Init Error:', err);
        isCloudReady = false;
        updateStatusIndicator('offline', 'OFFLINE');
    }

    // Anonymous Auth Verifier
    async function ensureAuth() {
        if (!isCloudReady || !fbAuth) return false;
        try {
            if (!fbAuth.currentUser) {
                await fbAuth.signInAnonymously();
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // Seed Initial Setup
    async function verifySeed() {
        if (!isCloudReady || !fbDb) return;
        try {
            await ensureAuth();
            const finRef = fbDb.collection(COLL_FINANCES).doc('summary');
            const snap = await finRef.get();
            if (!snap.exists) {
                await finRef.set({
                    dailyTotal: 0,
                    monthlyTotal: 0,
                    lastResetDate: new Date().toISOString()
                });
            }
        } catch (e) {}
    }

    // ==================== 1. USERS & DOCTORS CRUD ====================
    function subscribeDoctors(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_USERS)
            .where('role', '==', 'doctor')
            .onSnapshot(
                snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
                    callback(list);
                    updateStatusIndicator('online', 'LIVE');
                },
                err => {
                    console.error('❌ subscribeDoctors Error:', err);
                }
            );
    }

    async function addDoctorCloud(name, phone, username, subPassword) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const cleanUser = cleanInput(username).toLowerCase();
        const duplicateCheck = await fbDb.collection(COLL_USERS).where('username', '==', cleanUser).get();
        if (!duplicateCheck.empty) {
            throw new Error('اسم المستخدم مسجل مسبقاً لطبيب آخر!');
        }

        const uid = 'doc_' + Date.now().toString(36);
        const doctorData = {
            uid,
            name: cleanInput(name),
            phone: cleanInput(phone),
            username: cleanUser,
            subPassword: cleanInput(subPassword),
            role: 'doctor',
            isActive: true,
            createdAt: new Date().toISOString()
        };

        await fbDb.collection(COLL_USERS).doc(uid).set(doctorData);
        await logActivityCloud({
            type: 'financial',
            title: `إضافة حساب طبيب: ${doctorData.name}`,
            details: `المعرف: @${doctorData.username} | هاتف: ${doctorData.phone}`,
            user: 'المدير العام',
            role: 'admin'
        });

        return doctorData;
    }

    async function deleteDoctorCloud(doctorId, doctorName) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        await fbDb.collection(COLL_USERS).doc(doctorId).delete();
        await logActivityCloud({
            type: 'breach',
            title: `حذف حساب الطبيب: ${doctorName || doctorId}`,
            details: `تم حذف حساب الطبيب نهائياً وسحب كافة صلاحياته.`,
            user: 'المدير العام',
            role: 'admin'
        });
        return true;
    }

    async function toggleDoctorSessionStatus(doctorId, currentStatus) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const newStatus = !currentStatus;
        await fbDb.collection(COLL_USERS).doc(doctorId).update({ isActive: newStatus });
        await logActivityCloud({
            type: 'breach',
            title: newStatus ? 'تفعيل جلسة طبيب' : 'تجميد جلسة طبيب فورياً',
            details: `تم تغيير حالة الطبيب ID (${doctorId}) إلى: ${newStatus ? 'نشط' : 'مجمد'}`,
            user: 'المدير العام',
            role: 'admin'
        });
        return newStatus;
    }

    async function verifyDoctorCredentials(username, password) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const cleanUser = cleanInput(username).toLowerCase();
        const cleanPass = cleanInput(password);

        const snap = await fbDb.collection(COLL_USERS)
            .where('role', '==', 'doctor')
            .where('username', '==', cleanUser)
            .where('subPassword', '==', cleanPass)
            .get();

        if (snap.empty) {
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة!');
        }

        const doctorData = snap.docs[0].data();
        if (doctorData.isActive === false) {
            throw new Error('تم تجميد حسابك وجلستك من قبل الإدارة المركزية.');
        }

        return doctorData;
    }

    // ==================== 2. CENTRAL TREATMENTS CATALOG & STOCK ====================
    function subscribeTreatments(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_TREATMENTS)
            .onSnapshot(
                snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    callback(list);
                    updateStatusIndicator('online', 'LIVE');
                },
                err => {
                    console.error('❌ subscribeTreatments Error:', err);
                }
            );
    }

    async function addTreatmentCloud(name, defaultPrice, stock = 50) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const id = 'trt_' + Date.now().toString(36);
        const item = {
            id,
            name: cleanInput(name),
            defaultPrice: Math.max(0, Number(defaultPrice) || 0),
            stock: Math.max(0, Number(stock) || 50),
            consumed: 0,
            createdAt: new Date().toISOString()
        };

        await fbDb.collection(COLL_TREATMENTS).doc(id).set(item);
        return item;
    }

    async function updateTreatmentCloud(id, name, defaultPrice, stock) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const cleanName = cleanInput(name);
        const price = Math.max(0, Number(defaultPrice) || 0);
        const newStock = Math.max(0, Number(stock) || 0);

        await fbDb.collection(COLL_TREATMENTS).doc(id).update({
            name: cleanName,
            defaultPrice: price,
            stock: newStock
        });

        await logActivityCloud({
            type: 'financial',
            title: `تعديل سعر ومخزون العلاج: ${cleanName}`,
            details: `السعر الجديد: ${price} IQD | الكمية الكلية: ${newStock}`,
            user: 'المدير العام',
            role: 'admin'
        });

        return true;
    }

    async function deleteTreatmentCloud(id) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        await fbDb.collection(COLL_TREATMENTS).doc(id).delete();
        return true;
    }

    // ==================== 3. PATIENT SESSIONS & CONSUMED LOGS ====================
    function subscribeSessions(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_SESSIONS)
            .onSnapshot(
                snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                    callback(list);
                },
                err => {
                    console.error('❌ subscribeSessions Error:', err);
                }
            );
    }

    async function recordPatientSessionCloud(sessionData) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بالسحابة غير متوفر!');
        await ensureAuth();

        const sessionId = 'sess_' + Date.now().toString(36);
        const fullSession = {
            id: sessionId,
            doctorId: cleanInput(sessionData.doctorId),
            doctorName: cleanInput(sessionData.doctorName),
            doctorPhone: cleanInput(sessionData.doctorPhone),
            patientName: cleanInput(sessionData.patientName),
            patientPhone: cleanInput(sessionData.patientPhone),
            treatmentId: cleanInput(sessionData.treatmentId),
            treatmentName: cleanInput(sessionData.treatmentName),
            finalPrice: Math.max(0, Number(sessionData.finalPrice) || 0),
            session1Date: sessionData.session1Date,
            session2Date: sessionData.session2Date,
            createdAt: new Date().toISOString()
        };

        updateStatusIndicator('sync', 'SAVING');

        // 1. Save Session Document directly
        await fbDb.collection(COLL_SESSIONS).doc(sessionId).set(fullSession);

        // 2. Increment Daily Revenue safely
        if (fullSession.finalPrice > 0) {
            fbDb.collection(COLL_FINANCES).doc('summary').set({
                dailyTotal: firebase.firestore.FieldValue.increment(fullSession.finalPrice)
            }, { merge: true }).catch(() => {});
        }

        // 3. Update Treatment Consumed Count in Catalog
        if (fullSession.treatmentId) {
            fbDb.collection(COLL_TREATMENTS).doc(fullSession.treatmentId).update({
                consumed: firebase.firestore.FieldValue.increment(1)
            }).catch(() => {});
        }

        // 4. Log to Consumed Products Logs
        const logId = 'csl_' + Date.now().toString(36);
        fbDb.collection(COLL_CONSUMED_LOGS).doc(logId).set({
            id: logId,
            treatmentId: fullSession.treatmentId || '',
            treatmentName: fullSession.treatmentName,
            doctorId: fullSession.doctorId,
            doctorName: fullSession.doctorName,
            patientName: fullSession.patientName,
            qty: 1,
            timestamp: new Date().toISOString()
        }).catch(() => {});

        // 5. Activity Movement
        const actId = 'act_' + Date.now().toString(36);
        fbDb.collection(COLL_ACTIVITIES).doc(actId).set({
            id: actId,
            type: 'session',
            title: `جلسة مراجع: ${fullSession.patientName}`,
            details: `العلاج: ${fullSession.treatmentName} | السعر: ${fullSession.finalPrice} IQD`,
            user: fullSession.doctorName,
            role: 'doctor',
            doctorId: fullSession.doctorId,
            timestamp: new Date().toISOString()
        }).catch(() => {});

        updateStatusIndicator('online', 'LIVE');
        return fullSession;
    }

    async function deleteSessionCloud(sessionId) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        await fbDb.collection(COLL_SESSIONS).doc(sessionId).delete();
        await logActivityCloud({
            type: 'financial',
            title: `حذف وأرشفة جلسة مراجع`,
            details: `تم حذف وثيقة الجلسة ID: ${sessionId} من السجل النشط ونقلها للأرشيف.`,
            user: 'المدير العام',
            role: 'admin'
        });
        return true;
    }

    function subscribeConsumedLogs(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_CONSUMED_LOGS)
            .onSnapshot(
                snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                    callback(list);
                },
                err => {
                    console.error('❌ subscribeConsumedLogs Error:', err);
                }
            );
    }

    // ==================== 4. ACTIVITIES LOG ====================
    function subscribeActivities(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_ACTIVITIES)
            .onSnapshot(
                snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                    callback(list.slice(0, 60));
                },
                err => {
                    console.error('❌ subscribeActivities Error:', err);
                }
            );
    }

    async function logActivityCloud(activityData) {
        if (!isCloudReady || !fbDb) return;
        try {
            await ensureAuth();
            const id = 'act_' + Date.now().toString(36);
            const record = {
                id,
                type: cleanInput(activityData.type),
                title: cleanInput(activityData.title),
                details: cleanInput(activityData.details),
                user: cleanInput(activityData.user),
                role: cleanInput(activityData.role),
                timestamp: activityData.timestamp || new Date().toISOString()
            };
            await fbDb.collection(COLL_ACTIVITIES).doc(id).set(record);
            return record;
        } catch (e) {}
    }

    // ==================== 5. FINANCES, SETTLEMENT & RESETS ====================
    function subscribeFinances(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_FINANCES).doc('summary').onSnapshot(
            doc => {
                if (doc.exists) {
                    callback(doc.data());
                } else {
                    callback({ dailyTotal: 0, monthlyTotal: 0 });
                }
            },
            err => {
                console.error('❌ subscribeFinances Error:', err);
            }
        );
    }

    async function transferDailyRevenueCloud(currentDaily, currentMonthly) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const newMonthly = Number(currentMonthly || 0) + Number(currentDaily || 0);

        await fbDb.collection(COLL_FINANCES).doc('summary').set({
            dailyTotal: 0,
            monthlyTotal: newMonthly,
            lastResetDate: new Date().toISOString()
        }, { merge: true });

        await logActivityCloud({
            type: 'financial',
            title: 'الترحيل المالي اليومي',
            details: `تم ترحيل مبلغ ${currentDaily} IQD إلى الإيراد الشهري وتصفير اليوم`,
            user: 'المدير العام',
            role: 'admin'
        });

        return true;
    }

    async function fullSystemResetCloud() {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        // 1. Reset Finances to Zero
        await fbDb.collection(COLL_FINANCES).doc('summary').set({
            dailyTotal: 0,
            monthlyTotal: 0,
            lastResetDate: new Date().toISOString()
        });

        // 2. Clear Debts Collection
        const debtsSnap = await fbDb.collection(COLL_DEBTS).get();
        const batch = fbDb.batch();
        debtsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        await logActivityCloud({
            type: 'breach',
            title: '⚠️ تصفير شامل للنظام (Full Reset)',
            details: 'تم تصفير الإيراد اليومي والشهري ومسح سجل الديون بالكامل بأمر المدير العام.',
            user: 'المدير العام',
            role: 'admin'
        });

        return true;
    }

    // ==================== 6. DEBTS REGISTRY ====================
    function subscribeDebts(callback) {
        if (!isCloudReady || !fbDb) return () => {};

        return fbDb.collection(COLL_DEBTS).onSnapshot(
            snap => {
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                callback(list);
            },
            err => {
                console.error('❌ subscribeDebts Error:', err);
            }
        );
    }

    async function addDebtCloud(patientName, patientPhone, remainingAmount) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const id = 'debt_' + Date.now().toString(36);
        const debtRecord = {
            id,
            patientName: cleanInput(patientName),
            patientPhone: cleanInput(patientPhone),
            remainingAmount: Math.max(0, Number(remainingAmount) || 0),
            status: 'unpaid',
            createdAt: new Date().toISOString()
        };

        await fbDb.collection(COLL_DEBTS).doc(id).set(debtRecord);
        return debtRecord;
    }

    async function payDebtCloud(id, amountPaid, currentRemaining) {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const newRem = Math.max(0, currentRemaining - amountPaid);
        const newStatus = newRem === 0 ? 'paid' : 'partial';

        await fbDb.collection(COLL_DEBTS).doc(id).update({
            remainingAmount: newRem,
            status: newStatus
        });

        await fbDb.collection(COLL_FINANCES).doc('summary').set({
            dailyTotal: firebase.firestore.FieldValue.increment(Number(amountPaid) || 0)
        }, { merge: true });

        return true;
    }

    async function resetAllDebtsCloud() {
        if (!isCloudReady || !fbDb) throw new Error('الاتصال بقاعدة البيانات غير متوفر!');
        await ensureAuth();

        const snap = await fbDb.collection(COLL_DEBTS).get();
        const batch = fbDb.batch();
        snap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        await logActivityCloud({
            type: 'financial',
            title: 'تصفير سجل الديون بالكامل',
            details: 'تم مسح وتصفير كافة الديون المترتبة على المرضى.',
            user: 'المدير العام',
            role: 'admin'
        });
        return true;
    }

    // Export Firebase API
    window.MedicalFirebase = {
        init: async function () {
            await ensureAuth();
            await verifySeed();
        },
        verifyDoctorCredentials,
        subscribeDoctors,
        addDoctorCloud,
        deleteDoctorCloud,
        toggleDoctorSessionStatus,
        subscribeTreatments,
        addTreatmentCloud,
        updateTreatmentCloud,
        deleteTreatmentCloud,
        subscribeSessions,
        recordPatientSessionCloud,
        deleteSessionCloud,
        subscribeConsumedLogs,
        subscribeActivities,
        logActivityCloud,
        subscribeFinances,
        transferDailyRevenueCloud,
        fullSystemResetCloud,
        subscribeDebts,
        addDebtCloud,
        payDebtCloud,
        resetAllDebtsCloud,
        updateStatusIndicator
    };
})();
