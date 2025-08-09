/***********************
 * app.js - Bebo Play
 * Requires: Firebase compat SDKs loaded in index.html
 ***********************/

/* ====== CONFIG - ضع هنا إعداد Firebase الخاص بك ====== */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
/* ==================================================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* عناصر DOM */
const appsGrid = document.getElementById('appsGrid');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const yearEl = document.getElementById('year');
yearEl.textContent = new Date().getFullYear();

/* modals buttons */
document.getElementById('btn-show-login').onclick = ()=> showModal('modal-auth');
document.getElementById('btn-show-dev-register').onclick = ()=> showModal('modal-dev');
document.querySelectorAll('.close').forEach(b=> b.onclick = e => hideModal(e.target.dataset.target || e.target.closest('.modal').id));

/* auth modal actions */
document.getElementById('btnLogin').onclick = async ()=>{
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  try{
    await auth.signInWithEmailAndPassword(email, pass);
    hideModal('modal-auth');
    initAppForUser();
  }catch(err){ document.getElementById('authMsg').textContent = err.message; }
};
document.getElementById('btnRegister').onclick = async ()=>{
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  try{
    await auth.createUserWithEmailAndPassword(email, pass);
    hideModal('modal-auth');
    initAppForUser();
  }catch(err){ document.getElementById('authMsg').textContent = err.message; }
};

/* dev register */
document.getElementById('btnDevRegister').onclick = async ()=>{
  const name = document.getElementById('devName').value.trim();
  const email = document.getElementById('devEmail').value.trim();
  const phone = document.getElementById('devPhone').value.trim();
  const pass = document.getElementById('devPass').value;
  if(!name||!email||!pass){ alert('اكمل البيانات'); return; }
  // create account then add developer doc (isApproved=false)
  try{
    const userCred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid = userCred.user.uid;
    await db.collection('developers').doc(uid).set({
      name, email, phone, uid, isApproved: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), balance: 0
    });
    alert('تم إنشاء حساب المطور — ستنتظر موافقة الأدمن لرفع التطبيقات.');
    hideModal('modal-dev');
    initAppForUser();
  }catch(err){ alert(err.message); }
};

/* upload app (requires approved developer) */
document.getElementById('btnUploadApp')?.addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if(!user) { alert('سجل أولاً'); return; }
  // check developer approved
  const devDoc = await db.collection('developers').doc(user.uid).get();
  if(!devDoc.exists || !devDoc.data().isApproved){ alert('حسابك كمطور غير مفعل بعد'); return; }

  const name = document.getElementById('appName').value.trim();
  const category = document.getElementById('appCategory').value.trim() || 'عام';
  const desc = document.getElementById('appDesc').value.trim();
  const apkFile = document.getElementById('appApk').files[0];
  const screens = Array.from(document.getElementById('appScreens').files || []);

  if(!name || !apkFile){ alert('الاسم وملف الـ APK مطلوبان'); return; }

  try{
    const appId = db.collection('apps').doc().id;
    // upload APK
    const apkRef = storage.ref().child(`apps/${appId}/${apkFile.name}`);
    const apkSnap = await apkRef.put(apkFile);
    const apkUrl = await apkRef.getDownloadURL();

    // upload screenshots
    const screensUrls = [];
    for(let i=0;i<screens.length;i++){
      const s = screens[i];
      const sRef = storage.ref().child(`apps/${appId}/screens_${i}_${s.name}`);
      await sRef.put(s);
      screensUrls.push(await sRef.getDownloadURL());
    }

    // create app doc (isApproved false by default)
    await db.collection('apps').doc(appId).set({
      id: appId,
      name, category, description: desc, apkUrl, screens: screensUrls,
      devId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      isApproved: false,
      downloads: 0,
      rating: 0
    });

    alert('تم رفع التطبيق — ينتظر موافقة الأدمن');
    hideModal('modal-upload');
  }catch(err){ console.error(err); alert('خطأ في الرفع: '+err.message); }
});

/* helper modals */
function showModal(id){ document.getElementById(id).classList.remove('hidden'); }
function hideModal(id){ document.getElementById(id).classList.add('hidden'); }

/* auth state observer */
auth.onAuthStateChanged(user=>{
  if(user) initAppForUser();  // refresh UI
  loadApps(); // always load available apps
});

/* load approved apps */
async function loadApps(){
  appsGrid.innerHTML = '<p class="muted">جاري تحميل التطبيقات...</p>';
  const snapshot = await db.collection('apps').where('isApproved','==', true).orderBy('createdAt','desc').get();
  const apps = snapshot.docs.map(d=>d.data());
  renderApps(apps);
}

/* render apps */
function renderApps(apps){
  appsGrid.innerHTML = '';
  if(apps.length===0){ appsGrid.innerHTML = '<p class="muted">لا توجد تطبيقات حتى الآن.</p>'; return; }
  apps.forEach(a=>{
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div class="icon">📱</div>
        <div style="flex:1">
          <h4>${escapeHtml(a.name)}</h4>
          <p>${escapeHtml(a.category || '')}</p>
        </div>
      </div>
      <div class="meta">
        <span class="muted">${(a.downloads||0)} تحميل</span>
        <div>
          <button class="btn btn-open">تفاصيل</button>
          <button class="btn btn-download">تحميل</button>
        </div>
      </div>`;
    el.querySelector('.btn-open').onclick = ()=> openDetail(a);
    el.querySelector('.btn-download').onclick = ()=> handleDownload(a);
    appsGrid.appendChild(el);
  });
}

/* show detail modal */
function openDetail(a){
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <h2>${escapeHtml(a.name)}</h2>
    <p class="muted">${escapeHtml(a.description || '')}</p>
    <div style="display:flex;gap:8px;overflow:auto;margin-top:8px">${(a.screens||[]).map(s=>`<img src="${s}" style="height:160px;border-radius:8px;object-fit:cover" />`).join('')}</div>
    <div style="margin-top:10px">
      <button id="detailDownload" class="btn">تحميل الآن</button>
    </div>
  `;
  showModal('modal-detail');
  document.getElementById('detailDownload').onclick = ()=> handleDownload(a);
}

/* handle download: create downloads doc — Cloud Function will process commission */
async function handleDownload(app){
  // increment downloads counter locally & open apk link
  if(!confirm('سيبدأ التحميل الآن. هل تريد المتابعة؟')) return;
  try{
    // create a download record — Cloud Function will compute splitting
    await db.collection('downloads').add({
      appId: app.id,
      devId: app.devId,
      userId: auth.currentUser ? auth.currentUser.uid : null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      platform: 'web',
      revenueEstimate: 1.0 // افتراضي (1 جنيـه/تحميل) — يمكن تغييره لاحقًا
    });
    // update app counter (optimistic)
    await db.collection('apps').doc(app.id).update({
      downloads: firebase.firestore.FieldValue.increment(1)
    });
    // open apk url in new tab
    window.open(app.apkUrl, '_blank');
    alert('تم تسجيل التنزيل وبدأ التحميل.');
  }catch(err){ console.error(err); alert('خطأ أثناء التسجيل: '+err.message); }
}

/* init for signed-in user */
async function initAppForUser(){
  const user = auth.currentUser;
  if(!user) return;
  // check if developer and approved
  const devDoc = await db.collection('developers').doc(user.uid).get();
  if(devDoc.exists){
    const dev = devDoc.data();
    if(dev.isApproved){
      // show upload button to developer
      document.getElementById('btn-my-apps').classList.remove('hidden');
      // bind upload modal
      // show 'upload' action link or button (could be in UI)
      // for convenience add topbar upload button
      if(!document.getElementById('top-upload')){
        const top = document.querySelector('.topbar .auth');
        const b = document.createElement('button');
        b.id = 'top-upload';
        b.textContent = 'رفع تطبيق';
        b.onclick = ()=> showModal('modal-upload');
        top.prepend(b);
      }
    }else{
      // developer exists but not approved
      console.log('Dev registered but not approved yet.');
    }
  }
}

/* small util */
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
