/* ==============================
   SADULUR — app.js
   Auth | Data | Security
   ============================== */

'use strict';

// ============================================================
// CONFIG & CONSTANTS
// ============================================================
const APP_KEY    = 'sadulur_app';
const SESSION_KEY = 'sadulur_session';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES    = 15;

// ============================================================
// SECURITY UTILITIES
// ============================================================

/** Simple hash using Web Crypto (async) */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'sadulur_salt_2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
}

/** Sanitize string input */
function sanitize(str) {
  return String(str).replace(/[<>"'/]/g, '').trim();
}

/** Validate email */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate password strength */
function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0–5
}

function checkPasswordStrength(pw) {
  const score  = getPasswordStrength(pw);
  const fill   = document.getElementById('pwFill');
  const label  = document.getElementById('pwLabel');
  if (!fill) return;
  const levels = [
    { pct:'0%',   color:'transparent', text:'—' },
    { pct:'20%',  color:'#e05252',     text:'Lemah' },
    { pct:'40%',  color:'#e0a050',     text:'Cukup' },
    { pct:'60%',  color:'#e0d050',     text:'Sedang' },
    { pct:'80%',  color:'#7dc47d',     text:'Kuat' },
    { pct:'100%', color:'#4caf7d',     text:'Sangat Kuat' },
  ];
  const l = levels[score] || levels[0];
  fill.style.width = l.pct;
  fill.style.background = l.color;
  label.textContent = l.text;
  label.style.color  = l.color;
}

/** Generate unique ID */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Get timestamp string */
function nowStr() {
  return new Date().toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
}

// ============================================================
// DATA STORE (localStorage-backed)
// ============================================================

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(APP_KEY)) || { users: [], products: [] };
  } catch { return { users: [], products: [] }; }
}

function saveStore(store) {
  localStorage.setItem(APP_KEY, JSON.stringify(store));
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
  } catch { return null; }
}

function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ============================================================
// STATE
// ============================================================
let store   = loadStore();
let session = loadSession();
let currentProduct = null;
let allProducts = [];
let cart = [];
let wishlist = JSON.parse(localStorage.getItem('sadulur_wishlist') || '[]');

// ============================================================
// PRODUCTS DATA (load from data.json reference)
// ============================================================
const PRODUCTS = [
  { id:1, name:'Kaos Heritage Batik',   category:'kaos',   price:185000, emoji:'👕', badge:'BESTSELLER',
    desc:'Kaos premium dengan motif batik heritage yang dipadukan dengan bahan katun combed 30s. Nyaman dipakai seharian.',
    sizes:['S','M','L','XL','XXL'], stock:50 },
  { id:2, name:'Kemeja Lurik Modern',   category:'kemeja', price:285000, emoji:'👔', badge:'NEW',
    desc:'Kemeja dengan corak lurik khas Jawa yang dimodernisasi. Cocok untuk acara formal maupun semi-formal.',
    sizes:['S','M','L','XL'], stock:30 },
  { id:3, name:'Jaket Bomber Etnik',    category:'jaket',  price:450000, emoji:'🧥', badge:'LIMITED',
    desc:'Jaket bomber dengan aksen bordir motif etnik nusantara. Bahan nylon premium anti-angin.',
    sizes:['M','L','XL','XXL'], stock:15 },
  { id:4, name:'Celana Jogger Wayang',  category:'celana', price:220000, emoji:'👖', badge:'NEW',
    desc:'Celana jogger dengan print motif wayang. Bahan fleece lembut dan elastis.',
    sizes:['S','M','L','XL','XXL'], stock:40 },
  { id:5, name:'Kaos Tenun Premium',    category:'kaos',   price:210000, emoji:'🎽', badge:'',
    desc:'Kaos dengan texture tenun halus. Tampil kasual namun tetap berkarakter budaya.',
    sizes:['S','M','L','XL'], stock:60 },
  { id:6, name:'Kemeja Batik Tulis',    category:'kemeja', price:380000, emoji:'👘', badge:'PREMIUM',
    desc:'Kemeja batik tulis asli Yogyakarta dengan motif parang. Setiap lembar adalah karya seni.',
    sizes:['S','M','L','XL','XXL'], stock:20 },
];

function formatPrice(n) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ============================================================
// AUTH UI
// ============================================================
function switchAuth(mode) {
  document.querySelectorAll('.auth-box').forEach(b => b.classList.remove('active'));
  clearAlerts();
  if (mode === 'login')    document.getElementById('loginBox').classList.add('active');
  if (mode === 'register') document.getElementById('registerBox').classList.add('active');
  if (mode === 'forgot')   document.getElementById('forgotBox').classList.add('active');
}

function clearAlerts() {
  document.querySelectorAll('.alert').forEach(a => { a.className = 'alert hidden'; a.textContent = ''; });
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert ${type}`;
}

document.getElementById('forgotLink').addEventListener('click', (e) => {
  e.preventDefault(); switchAuth('forgot');
});

// Password visibility toggle
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

// ============================================================
// LOGIN
// ============================================================
async function handleLogin() {
  const email    = sanitize(document.getElementById('loginEmail').value.trim());
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMe').checked;

  if (!email || !password) return showAlert('loginAlert', 'Email dan password harus diisi.');
  if (!isValidEmail(email)) return showAlert('loginAlert', 'Format email tidak valid.');

  setLoading('loginBtn', true);

  // Brute-force check
  const attemptKey = `sadulur_attempts_${email}`;
  const attemptData = JSON.parse(localStorage.getItem(attemptKey) || '{"count":0,"until":0}');
  if (attemptData.until > Date.now()) {
    const minsLeft = Math.ceil((attemptData.until - Date.now()) / 60000);
    setLoading('loginBtn', false);
    return showAlert('loginAlert', `Akun dikunci sementara. Coba lagi dalam ${minsLeft} menit.`);
  }

  await delay(500); // Simulate network

  const hashed = await hashPassword(password);
  const user   = store.users.find(u => u.email === email && u.password === hashed);

  if (!user) {
    attemptData.count++;
    if (attemptData.count >= MAX_LOGIN_ATTEMPTS) {
      attemptData.until = Date.now() + (LOCKOUT_MINUTES * 60 * 1000);
      attemptData.count = 0;
      localStorage.setItem(attemptKey, JSON.stringify(attemptData));
      setLoading('loginBtn', false);
      return showAlert('loginAlert', `Terlalu banyak percobaan gagal. Akun dikunci ${LOCKOUT_MINUTES} menit.`);
    }
    localStorage.setItem(attemptKey, JSON.stringify(attemptData));
    setLoading('loginBtn', false);
    return showAlert('loginAlert', `Email atau password salah. (${MAX_LOGIN_ATTEMPTS - attemptData.count} percobaan tersisa)`);
  }

  // Reset attempts
  localStorage.removeItem(attemptKey);

  // Log login
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.unshift({ time: nowStr(), device: navigator.userAgent.slice(0,80) });
  if (user.loginHistory.length > 10) user.loginHistory.pop();
  saveStore(store);

  if (remember) localStorage.setItem('sadulur_remember', email);

  session = { ...user };
  saveSession(session);
  setLoading('loginBtn', false);
  bootApp();
}

// ============================================================
// REGISTER
// ============================================================
async function handleRegister() {
  const firstName = sanitize(document.getElementById('regFirstName').value.trim());
  const lastName  = sanitize(document.getElementById('regLastName').value.trim());
  const email     = sanitize(document.getElementById('regEmail').value.trim().toLowerCase());
  const phone     = sanitize(document.getElementById('regPhone').value.trim());
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regConfirm').value;
  const dob       = document.getElementById('regDob').value;
  const gender    = document.getElementById('regGender').value;
  const agreed    = document.getElementById('agreeTerms').checked;

  if (!firstName || !lastName) return showAlert('registerAlert', 'Nama depan dan belakang harus diisi.');
  if (!email)    return showAlert('registerAlert', 'Email harus diisi.');
  if (!isValidEmail(email)) return showAlert('registerAlert', 'Format email tidak valid.');
  if (!password) return showAlert('registerAlert', 'Password harus diisi.');
  if (password.length < 8) return showAlert('registerAlert', 'Password minimal 8 karakter.');
  if (getPasswordStrength(password) < 2) return showAlert('registerAlert', 'Password terlalu lemah. Gunakan huruf besar, angka, atau simbol.');
  if (password !== confirm) return showAlert('registerAlert', 'Konfirmasi password tidak cocok.');
  if (!agreed) return showAlert('registerAlert', 'Anda harus menyetujui syarat & ketentuan.');

  if (store.users.find(u => u.email === email)) return showAlert('registerAlert', 'Email sudah terdaftar. Silakan login.');

  setLoading('registerBtn', true);
  await delay(600);

  const hashed = await hashPassword(password);
  const newUser = {
    id: genId(),
    firstName, lastName, email, phone,
    password: hashed,
    dob, gender,
    createdAt: nowStr(),
    verified: false,
    loginHistory: [],
    addresses: [],
    orders: [],
    wishlistIds: [],
    avatar: null,
  };

  store.users.push(newUser);
  saveStore(store);

  setLoading('registerBtn', false);
  showAlert('registerAlert', `Akun berhasil dibuat! Silakan login dengan email ${email}.`, 'success');
  setTimeout(() => switchAuth('login'), 2000);
}

// ============================================================
// FORGOT PASSWORD
// ============================================================
async function handleForgot() {
  const email = sanitize(document.getElementById('forgotEmail').value.trim().toLowerCase());
  if (!email || !isValidEmail(email)) return showAlert('forgotAlert', 'Masukkan email yang valid.');
  await delay(800);
  // In a real app: send email link
  showAlert('forgotAlert', `Jika email ${email} terdaftar, link reset telah dikirim. Periksa inbox Anda.`, 'success');
}

// ============================================================
// LOGOUT
// ============================================================
function handleLogout() {
  if (!confirm('Yakin ingin keluar dari akun?')) return;
  clearSession();
  session = null;
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authOverlay').classList.remove('hidden');
  switchAuth('login');
  toast('Berhasil keluar.', 'info');
}

// ============================================================
// BOOT APP
// ============================================================
function bootApp() {
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  // Greet
  const name = session.firstName || session.email.split('@')[0];
  document.getElementById('navGreet').textContent = `Halo, ${name}!`;
  document.getElementById('navAvatar').textContent = name[0].toUpperCase();
  document.getElementById('profileAvatar').textContent = name[0].toUpperCase();

  // Load avatar
  if (session.avatar) {
    setAvatarImg(session.avatar);
  }

  // Fill profile fields
  const fields = {
    profFirstName: session.firstName || '',
    profLastName:  session.lastName  || '',
    profEmail:     session.email     || '',
    profPhone:     session.phone     || '',
    profDob:       session.dob       || '',
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  const genderEl = document.getElementById('profGender');
  if (genderEl) genderEl.value = session.gender || '';

  // Render products
  allProducts = PRODUCTS;
  renderProducts('featuredGrid', PRODUCTS.slice(0,4));
  renderProducts('catalogGrid', PRODUCTS);

  // Load addresses
  renderAddresses();
  renderOrders();
  renderWishlistGrid();

  showSection('home');
}

// ============================================================
// SECTIONS
// ============================================================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  const menuItem = document.getElementById(`menu-${name}`);
  if (menuItem) menuItem.classList.add('active');
  closeSidebar();
  closeUserMenu();
}

// ============================================================
// SIDEBAR
// ============================================================
function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ============================================================
// USER MENU
// ============================================================
function toggleUserMenu() {
  document.getElementById('userDropdown').classList.toggle('open');
}
function closeUserMenu() {
  document.getElementById('userDropdown').classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.avatar-menu')) closeUserMenu();
});

// ============================================================
// PRODUCTS
// ============================================================
function renderProducts(gridId, products) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!products.length) { grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">Produk tidak ditemukan.</p>'; return; }
  grid.innerHTML = products.map(p => `
    <div class="product-card" onclick="openProduct(${p.id})">
      <div class="product-img">
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ''}
        <span>${p.emoji}</span>
      </div>
      <div class="product-body">
        <p class="product-cat">${p.category}</p>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-price">${formatPrice(p.price)}</p>
        <div class="product-actions">
          <button class="btn-secondary" onclick="event.stopPropagation(); addWishlistById(${p.id})">❤</button>
          <button class="btn-primary" onclick="event.stopPropagation(); openProduct(${p.id})">Detail</button>
        </div>
      </div>
    </div>
  `).join('');
}

function filterProducts() {
  const cat  = document.getElementById('catFilter').value;
  const q    = document.getElementById('searchProd').value.toLowerCase();
  let filtered = allProducts;
  if (cat !== 'all') filtered = filtered.filter(p => p.category === cat);
  if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q));
  renderProducts('catalogGrid', filtered);
}

function openProduct(id) {
  currentProduct = allProducts.find(p => p.id === id);
  if (!currentProduct) return;
  document.getElementById('modalEmoji').textContent = currentProduct.emoji;
  document.getElementById('modalBadge').textContent = currentProduct.badge;
  document.getElementById('modalBadge').style.display = currentProduct.badge ? 'inline-block' : 'none';
  document.getElementById('modalName').textContent = currentProduct.name;
  document.getElementById('modalPrice').textContent = formatPrice(currentProduct.price);
  document.getElementById('modalDesc').textContent = currentProduct.desc;
  const sp = document.getElementById('sizePicker');
  sp.innerHTML = currentProduct.sizes.map(s => `<button class="size-btn" onclick="selectSize(this,'${s}')">${s}</button>`).join('');
  document.getElementById('productModal').classList.remove('hidden');
}

function selectSize(btn, size) {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (currentProduct) currentProduct.selectedSize = size;
}

function closeModal(e) {
  if (e.target.id === 'productModal') document.getElementById('productModal').classList.add('hidden');
}

function addToCart(product) {
  if (!product) return;
  if (!product.selectedSize) return toast('Pilih ukuran terlebih dahulu.', 'error');
  cart.push({ ...product, qty: 1 });
  toast(`${product.name} (${product.selectedSize}) ditambahkan ke keranjang! 🛒`, 'success');
  document.getElementById('productModal').classList.add('hidden');
}

// ============================================================
// WISHLIST
// ============================================================
function addWishlistById(id) {
  const p = allProducts.find(x => x.id === id);
  if (p) addWishlist(p);
}

function addWishlist(product) {
  if (!product) return;
  if (wishlist.find(w => w.id === product.id)) return toast('Sudah ada di wishlist.', 'info');
  wishlist.push(product);
  localStorage.setItem('sadulur_wishlist', JSON.stringify(wishlist));
  renderWishlistGrid();
  toast(`${product.name} ditambahkan ke wishlist ❤`, 'success');
}

function removeWishlist(id) {
  wishlist = wishlist.filter(w => w.id !== id);
  localStorage.setItem('sadulur_wishlist', JSON.stringify(wishlist));
  renderWishlistGrid();
  toast('Dihapus dari wishlist.', 'info');
}

function renderWishlistGrid() {
  const grid  = document.getElementById('wishlistGrid');
  const empty = document.getElementById('wishlistEmpty');
  if (!wishlist.length) {
    empty.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = wishlist.map(p => `
    <div class="product-card">
      <div class="product-img"><span>${p.emoji}</span></div>
      <div class="product-body">
        <p class="product-cat">${p.category}</p>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-price">${formatPrice(p.price)}</p>
        <div class="product-actions">
          <button class="btn-danger" onclick="removeWishlist(${p.id})">Hapus</button>
          <button class="btn-primary" onclick="openProduct(${p.id})">Beli</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// ORDERS (demo data)
// ============================================================
const DEMO_ORDERS = [
  { id:'ORD-001', name:'Kaos Heritage Batik', size:'L', qty:2, total:370000, status:'delivered', emoji:'👕', date:'10 Mei 2025' },
  { id:'ORD-002', name:'Kemeja Lurik Modern', size:'M', qty:1, total:285000, status:'shipped',   emoji:'👔', date:'15 Mei 2025' },
  { id:'ORD-003', name:'Jaket Bomber Etnik',  size:'L', qty:1, total:450000, status:'processing',emoji:'🧥', date:'18 Mei 2025' },
];

function renderOrders() {
  const list  = document.getElementById('ordersList');
  const empty = document.getElementById('ordersEmpty');
  const orders = DEMO_ORDERS;
  if (!orders.length) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
  empty.classList.add('hidden');
  list.classList.remove('hidden');
  const statusLabel = { delivered:'Terkirim', shipped:'Dalam Pengiriman', processing:'Diproses' };
  list.innerHTML = orders.map(o => `
    <div class="order-item">
      <div class="order-thumb">${o.emoji}</div>
      <div class="order-info">
        <p class="order-name">${o.name}</p>
        <p class="order-meta">Ukuran: ${o.size} · Qty: ${o.qty} · ${o.date}</p>
        <p class="order-meta" style="color:var(--gold)">${formatPrice(o.total)}</p>
      </div>
      <span class="order-status status-${o.status}">${statusLabel[o.status]}</span>
    </div>
  `).join('');
}

// ============================================================
// PROFILE
// ============================================================
function saveProfile() {
  if (!session) return;
  const user = store.users.find(u => u.id === session.id);
  if (!user) return;

  const updated = {
    firstName: sanitize(document.getElementById('profFirstName').value.trim()),
    lastName:  sanitize(document.getElementById('profLastName').value.trim()),
    phone:     sanitize(document.getElementById('profPhone').value.trim()),
    dob:       document.getElementById('profDob').value,
    gender:    document.getElementById('profGender').value,
  };

  if (!updated.firstName || !updated.lastName) return showAlert('profileAlert', 'Nama tidak boleh kosong.');

  Object.assign(user, updated);
  Object.assign(session, updated);
  saveStore(store);
  saveSession(session);

  document.getElementById('navGreet').textContent = `Halo, ${user.firstName}!`;
  document.getElementById('navAvatar').textContent = user.firstName[0].toUpperCase();
  document.getElementById('profileAvatar').textContent = user.firstName[0].toUpperCase();
  showAlert('profileAlert', 'Profil berhasil disimpan!', 'success');
  toast('Profil diperbarui ✓', 'success');
}

function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('File harus berupa gambar.', 'error');
  if (file.size > 2 * 1024 * 1024) return toast('Ukuran gambar maks 2MB.', 'error');

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    session.avatar = dataUrl;
    const user = store.users.find(u => u.id === session.id);
    if (user) user.avatar = dataUrl;
    saveStore(store);
    saveSession(session);
    setAvatarImg(dataUrl);
    toast('Foto profil diperbarui ✓', 'success');
  };
  reader.readAsDataURL(file);
}

function setAvatarImg(dataUrl) {
  const pa = document.getElementById('profileAvatar');
  pa.innerHTML = `<img src="${dataUrl}" alt="avatar" />`;
  const na = document.getElementById('navAvatar');
  na.innerHTML = '';
  na.style.backgroundImage = `url(${dataUrl})`;
  na.style.backgroundSize = 'cover';
}

// ============================================================
// ADDRESSES
// ============================================================
function toggleAddressForm() {
  const form = document.getElementById('addressForm');
  form.classList.toggle('hidden');
  ['addrLabel','addrName','addrPhone','addrProvince','addrCity','addrDistrict','addrFull','addrZip']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function saveAddress() {
  const label    = sanitize(document.getElementById('addrLabel').value.trim()) || 'Rumah';
  const name     = sanitize(document.getElementById('addrName').value.trim());
  const phone    = sanitize(document.getElementById('addrPhone').value.trim());
  const province = sanitize(document.getElementById('addrProvince').value.trim());
  const city     = sanitize(document.getElementById('addrCity').value.trim());
  const district = sanitize(document.getElementById('addrDistrict').value.trim());
  const full     = sanitize(document.getElementById('addrFull').value.trim());
  const zip      = sanitize(document.getElementById('addrZip').value.trim());

  if (!name || !full || !city) return showAlert('addrAlert', 'Nama, kota, dan alamat harus diisi.', 'error');
  if (zip && !/^\d{5}$/.test(zip)) return showAlert('addrAlert', 'Kode pos harus 5 digit.', 'error');

  const user = store.users.find(u => u.id === session.id);
  if (!user) return;
  user.addresses = user.addresses || [];

  const newAddr = { id: genId(), label, name, phone, province, city, district, full, zip, isDefault: user.addresses.length === 0 };
  user.addresses.push(newAddr);
  session.addresses = user.addresses;
  saveStore(store);
  saveSession(session);
  toggleAddressForm();
  renderAddresses();
  toast('Alamat berhasil ditambahkan ✓', 'success');
}

function setDefaultAddress(id) {
  const user = store.users.find(u => u.id === session.id);
  if (!user) return;
  user.addresses.forEach(a => { a.isDefault = (a.id === id); });
  session.addresses = user.addresses;
  saveStore(store);
  saveSession(session);
  renderAddresses();
  toast('Alamat utama diperbarui ✓', 'success');
}

function deleteAddress(id) {
  if (!confirm('Hapus alamat ini?')) return;
  const user = store.users.find(u => u.id === session.id);
  if (!user) return;
  user.addresses = user.addresses.filter(a => a.id !== id);
  session.addresses = user.addresses;
  saveStore(store);
  saveSession(session);
  renderAddresses();
  toast('Alamat dihapus.', 'info');
}

function renderAddresses() {
  const user = store.users.find(u => u.id === session?.id);
  const addresses = user?.addresses || [];
  const list = document.getElementById('addressList');
  if (!list) return;
  if (!addresses.length) { list.innerHTML = '<p style="color:var(--text-muted)">Belum ada alamat tersimpan.</p>'; return; }
  list.innerHTML = addresses.map(a => `
    <div class="address-item ${a.isDefault ? 'default' : ''}">
      <div class="addr-label">
        ${a.label} ${a.isDefault ? '<span class="addr-default-badge">Utama</span>' : ''}
      </div>
      <p class="addr-name">${a.name}</p>
      <p class="addr-detail">${a.full}, ${a.district ? a.district + ', ' : ''}${a.city}, ${a.province} ${a.zip}</p>
      ${a.phone ? `<p class="addr-detail">📱 ${a.phone}</p>` : ''}
      <div class="addr-actions">
        ${!a.isDefault ? `<button class="btn-sm" onclick="setDefaultAddress('${a.id}')">Jadikan Utama</button>` : ''}
        <button class="btn-danger" onclick="deleteAddress('${a.id}')">Hapus</button>
      </div>
    </div>
  `).join('');
}

// ============================================================
// SECURITY
// ============================================================
function togglePwForm() {
  document.getElementById('changePwForm').classList.toggle('hidden');
}

async function changePassword() {
  const oldPw = document.getElementById('oldPw').value;
  const newPw = document.getElementById('newPw').value;
  const conf  = document.getElementById('confirmPw').value;

  if (!oldPw || !newPw || !conf) return showAlert('pwAlert', 'Semua kolom harus diisi.');
  if (newPw.length < 8) return showAlert('pwAlert', 'Password baru minimal 8 karakter.');
  if (getPasswordStrength(newPw) < 2) return showAlert('pwAlert', 'Password baru terlalu lemah.');
  if (newPw !== conf) return showAlert('pwAlert', 'Konfirmasi password tidak cocok.');

  const oldHash = await hashPassword(oldPw);
  const user = store.users.find(u => u.id === session.id);
  if (!user || user.password !== oldHash) return showAlert('pwAlert', 'Password lama tidak sesuai.');

  user.password = await hashPassword(newPw);
  saveStore(store);
  showAlert('pwAlert', 'Password berhasil diubah!', 'success');
  ['oldPw','newPw','confirmPw'].forEach(id => document.getElementById(id).value = '');
  toast('Password diperbarui ✓', 'success');
}

function resendVerif() {
  toast('Link verifikasi dikirim ulang ke ' + session.email, 'info');
}

function showLoginHistory() {
  const user = store.users.find(u => u.id === session.id);
  const history = user?.loginHistory || [];
  if (!history.length) return toast('Belum ada riwayat login.', 'info');
  const info = history.slice(0,5).map((h, i) => `${i+1}. ${h.time}`).join('\n');
  alert('Riwayat Login Terakhir:\n\n' + info);
}

async function deleteAccount() {
  const confirmed = prompt('Ketik "HAPUS" untuk mengkonfirmasi penghapusan akun:');
  if (confirmed !== 'HAPUS') return toast('Penghapusan akun dibatalkan.', 'info');
  store.users = store.users.filter(u => u.id !== session.id);
  saveStore(store);
  clearSession();
  session = null;
  toast('Akun berhasil dihapus.', 'info');
  setTimeout(() => {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('authOverlay').classList.remove('hidden');
    switchAuth('login');
  }, 1000);
}

// ============================================================
// HELPERS
// ============================================================
function setLoading(btnId, loading) {
  const btn    = document.getElementById(btnId);
  const span   = btn.querySelector('span');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  span.classList.toggle('hidden', loading);
  loader.classList.toggle('hidden', !loading);
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

// ============================================================
// INIT
// ============================================================
(function init() {
  // Prefill remembered email
  const remembered = localStorage.getItem('sadulur_remember');
  if (remembered) document.getElementById('loginEmail').value = remembered;

  // Auto-login from session
  if (session) {
    // Refresh user data from store
    store = loadStore();
    const freshUser = store.users.find(u => u.id === session.id);
    if (freshUser) {
      session = { ...freshUser };
      saveSession(session);
      bootApp();
    } else {
      clearSession();
    }
  }
})();