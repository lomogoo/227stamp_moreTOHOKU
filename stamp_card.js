/* 1) Supabase 初期化 */
const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数 */
let currentUser = null; // email認証のUIDの代わりにユーザーオブジェクトを保持
let html5QrCode = null;
const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

/* 3) メイン処理 */
document.addEventListener('DOMContentLoaded', () => {
  const appLoader = document.getElementById('app-loader');
  appLoader.classList.remove('active');

  // ページ読み込み時に認証モーダルを表示
  document.getElementById('auth-modal').classList.add('active');

  setupStaticEventListeners();
  updateStampDisplay(0);
  updateRewardButtons(0);
});

/* 4) イベントリスナー設定 */
function setupStaticEventListeners() {
  document.getElementById('profile-form')?.addEventListener('submit', handleAuthentication);
  document.getElementById('scan-qr')?.addEventListener('click', initQRScanner);
  document.getElementById('coffee-reward')?.addEventListener('click', () => redeemReward('coffee'));
  document.getElementById('curry-reward')?.addEventListener('click', () => redeemReward('curry'));
  
  // モーダルを閉じる共通リスナー
  document.body.addEventListener('click', (e) => {
    if (e.target.matches('.close-modal') || e.target.matches('.close-notification')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
  });
}

/* 5) 認証とユーザー処理 */
async function handleAuthentication(e) {
  e.preventDefault();
  const form = e.target;
  const submitButton = form.querySelector('button[type="submit"]');
  const messageEl = document.getElementById('profile-message');
  
  const name = document.getElementById('name').value.trim();
  const birthdate = document.getElementById('birthdate').value;
  const gender = document.getElementById('gender').value;

  if (!name || !birthdate || !gender) {
    messageEl.textContent = '❌ すべての項目を入力してください。';
    return;
  }
  
  submitButton.disabled = true;
  submitButton.textContent = '確認中...';
  messageEl.textContent = '';

  try {
    // 名前、生年月日、性別でユーザーを検索
    let { data, error } = await db.from('stamp_users')
      .select('*')
      .eq('name', name)
      .eq('birthdate', birthdate)
      .eq('gender', gender)
      .maybeSingle();

    if (error) throw error;

    if (data) { // ユーザーが見つかった場合
      currentUser = data;
      showNotification('ようこそ！', `${currentUser.name}さんのスタンプカードを表示します。`);
    } else { // ユーザーが見つからない場合、新規作成
      if (!confirm('この情報で新しいスタンプカードを作成しますか？')) {
          submitButton.disabled = false;
          submitButton.textContent = 'この情報で確認・作成';
          return;
      }
      const { data: newUser, error: insertError } = await db.from('stamp_users')
        .insert([{ name, birthdate, gender }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      currentUser = newUser;
      showNotification('はじめまして！', `${currentUser.name}さんのスタンプカードを作成しました。`);
    }

    updateUIForAuthenticatedUser();
    closeModal(document.getElementById('auth-modal'));

  } catch (err) {
    console.error('Authentication error:', err);
    messageEl.textContent = `❌ エラーが発生しました: ${err.message}`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'この情報で確認・作成';
  }
}

function updateUIForAuthenticatedUser() {
  if (!currentUser) return;
  
  // ユーザー名表示とログアウト（情報リセット）ボタン
  const userStatusDiv = document.getElementById('user-status');
  userStatusDiv.innerHTML = `
    <div class="user-info">
      <span>${currentUser.name} 様</span>
      <button id="reset-button" class="btn">情報をリセット</button>
    </div>
  `;
  document.getElementById('reset-button').addEventListener('click', () => window.location.reload());

  // スタンプと特典の状態を更新
  updateStampDisplay(currentUser.stamp_count);
  updateRewardButtons(currentUser.stamp_count);
  
  // QRスキャンボタンを有効化
  document.getElementById('scan-qr').disabled = false;
}


/* 6) スタンプと特典のロジック (app.jsから移植・改造) */

function updateStampDisplay(count) {
  document.querySelectorAll('.stamp').forEach((el, i) => el.classList.toggle('active', i < count));
}

function updateRewardButtons(count) {
  const coffeeBtn = document.getElementById('coffee-reward');
  const curryBtn = document.getElementById('curry-reward');
  const coffeeItem = document.getElementById('coffee-reward-item');
  const curryItem = document.getElementById('curry-reward-item');

  if (coffeeBtn) coffeeBtn.disabled = count < 3;
  if (curryBtn) curryBtn.disabled = count < 6;
  coffeeItem?.classList.toggle('available', count >= 3);
  curryItem?.classList.toggle('available', count >= 6);
}

async function addStamp() {
  if (!currentUser) return;
  
  if (currentUser.stamp_count >= 6) {
    return showNotification('コンプリート！', 'スタンプが6個たまりました！');
  }

  try {
    const newCount = currentUser.stamp_count + 1;
    const { data, error } = await db.from('stamp_users')
      .update({ stamp_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id)
      .select()
      .single();

    if (error) throw error;
    
    currentUser = data; // ローカルのユーザー情報を更新
    updateStampDisplay(currentUser.stamp_count);
    updateRewardButtons(currentUser.stamp_count);
    
    if (currentUser.stamp_count === 3 || currentUser.stamp_count === 6) {
        showNotification('🎉 特典ゲット！', currentUser.stamp_count === 3 ? 'コーヒー1杯無料！' : 'カレー1杯無料！');
    } else {
        showNotification('スタンプ獲得！', `スタンプが ${currentUser.stamp_count} 個になりました。`);
    }

  } catch (error) {
    showNotification('エラー', 'スタンプの追加に失敗しました。');
  }
}

async function redeemReward(type) {
  if (!currentUser) return;
  
  const required = type === 'coffee' ? 3 : 6;
  if (currentUser.stamp_count < required) {
    return showNotification('スタンプ不足', 'スタンプが足りません。');
  }

  try {
    const newCount = currentUser.stamp_count - required;
    const { data, error } = await db.from('stamp_users')
      .update({ stamp_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id)
      .select()
      .single();
    
    if (error) throw error;

    currentUser = data; // ローカルのユーザー情報を更新
    updateStampDisplay(currentUser.stamp_count);
    updateRewardButtons(currentUser.stamp_count);
    showNotification('交換完了！', `${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しました。`);

  } catch (error) {
    showNotification('エラー', '特典の交換に失敗しました。');
  }
}

/* 7) QRスキャナーとヘルパー関数 (app.jsから移植) */

function initQRScanner() {
  const qrModal = document.getElementById('qr-modal');
  qrModal?.classList.add('active');
  let isProcessing = false;
  
  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' }, 
    { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      if (isProcessing) return;
      isProcessing = true;
      if (html5QrCode.isScanning) await html5QrCode.stop();
      closeModal(qrModal);
      if (decodedText === appData.qrString) {
        await addStamp();
      } else {
        showNotification('無効なQRコード', 'お店のQRコードではありません。');
      }
    },
    (errorMessage) => { /* スキャン中のエラーは無視 */ }
  ).catch(() => {
      document.getElementById('qr-reader').innerHTML = '<p style="color: red; text-align: center;">カメラの起動に失敗しました。<br>ブラウザのカメラアクセスを許可してください。</p>';
  });
}

function closeModal(modalElement) {
    if(!modalElement) return;
    modalElement.classList.remove('active');
    if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}

function showNotification(title, msg) {
  const modal = document.getElementById('notification-modal');
  if(modal){
    document.getElementById('notification-title').textContent = title;
    document.getElementById('notification-message').textContent = msg;
    modal.classList.add('active');
  }
}
