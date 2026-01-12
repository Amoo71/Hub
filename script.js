// JavaScript for the secret Post‑It system.
// This script implements a PIN challenge, an admin login overlay and
// functions to create, edit and delete posts. Account names and
// passwords are Base64‑encoded so they are not immediately readable
// when the site is published. The unlock and admin codes are stored
// only as SHA‑256 hashes split into parts. To change them, adjust
// the strings in `unlockHashParts` or `adminHashParts` below.

(function () {
  "use strict";

  // The unlock and admin codes are represented as SHA‑256 hashes split into
  // chunks. Join the parts to get the full hash. To change the codes,
  // compute a new SHA‑256 hex digest of your string (e.g. with
  // `crypto.subtle.digest` or an external tool) and split it into equal
  // parts here. See README for details.
  // Update these arrays to change the unlock and admin codes. Each string is
  // a 16‑character segment of the SHA‑256 digest. For example, the
  // code "7777" yields a digest of
  // 41c991eb6a66242c0454191244278183ce58cf4a6bcd372f799e4b9cc01886af
  // which is split into four parts below. Similarly, "6669666" is
  // split into segments for the admin code.
  const unlockHashParts = [
    "41c991eb6a66242c",
    "0454191244278183",
    "ce58cf4a6bcd372f",
    "799e4b9cc01886af",
  ];
  const adminHashParts = [
    "87ea1c22f3462ff9",
    "0ff2163e43de7107",
    "b01c7ddbfa672ffd",
    "0024011ab53a5bd1",
  ];
  const unlockHash = unlockHashParts.join("");
  const adminHash = adminHashParts.join("");

  // Helper to compute SHA‑256 hash of a string and return a hex string
  async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Elements from the DOM
  const unlockOverlay = document.getElementById("unlockOverlay");
  const unlockInput = document.getElementById("unlockInput");
  const unlockMessage = document.getElementById("unlockMessage");
  const app = document.getElementById("app");
  const adminTrigger = document.getElementById("adminTrigger");
  const adminControls = document.getElementById("adminControls");
  const addPostBtn = document.getElementById("addPostBtn");
  const postForm = document.getElementById("postForm");
  const postTitleInput = document.getElementById("postTitle");
  const postCoverInput = document.getElementById("postCover");
  const postAccInput = document.getElementById("postAcc");
  const postPwInput = document.getElementById("postPw");
  const savePostBtn = document.getElementById("savePostBtn");
  const cancelPostBtn = document.getElementById("cancelPostBtn");
  const postsContainer = document.getElementById("postsContainer");
  // Detail‑Panel Elemente
  const detailPanel = document.getElementById("detailPanel");
  const closeDetailBtn = document.getElementById("closeDetail");
  const detailTitle = document.getElementById("detailTitle");
  const detailCover = document.getElementById("detailCover");
  const detailAcc = document.getElementById("detailAcc");
  const detailPw = document.getElementById("detailPw");
  const copyDetailAcc = document.getElementById("copyDetailAcc");
  const copyDetailPw = document.getElementById("copyDetailPw");

  // Admin overlay elements
  const adminOverlay = document.getElementById("adminOverlay");
  const adminInput = document.getElementById("adminInput");
  const adminMessage = document.getElementById("adminMessage");
  const adminSubmit = document.getElementById("adminSubmit");

  // Confirm overlay elements
  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  // Toast element for notifications
  const toast = document.getElementById("toast");

  // Application state
  let adminActive = false;
  let posts = [];
  let editId = null; // ID des Posts, der gerade editiert wird (null für neu)
  let unlockTimer;
  let confirmCallback = null;

  /**
   * Initialisieren: Posts aus localStorage laden und ggf. erste Demo‑Daten anlegen.
   */
  function init() {
    try {
      const stored = localStorage.getItem("postit_posts");
      if (stored) {
        posts = JSON.parse(stored);
      }
    } catch (e) {
      // Ignorieren, falls JSON fehlerhaft
      posts = [];
    }

    // Falls keine Posts vorhanden, ein Beispielpost anlegen (kann später gelöscht werden)
    if (posts.length === 0) {
      posts.push({
        id: Date.now(),
        title: "Sample Account",
        cover: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
        acc: btoa("demo@example.com"),
        pw: btoa("Password123"),
      });
      savePosts();
    }
    renderPosts();
  }

  /**
   * Posts im LocalStorage sichern.
   */
  function savePosts() {
    localStorage.setItem("postit_posts", JSON.stringify(posts));
  }

  /**
   * Rendert alle Posts ins DOM.
   */
  function renderPosts() {
    postsContainer.innerHTML = "";
    posts.forEach((post) => {
      const card = document.createElement("div");
      card.classList.add("postCard", "glass");
      card.dataset.id = post.id;
      // Bild
      const img = document.createElement("img");
      img.src = post.cover || "";
      img.alt = post.title;
      card.appendChild(img);
      // Titel
      const titleDiv = document.createElement("div");
      titleDiv.classList.add("postTitle");
      titleDiv.textContent = post.title;
      card.appendChild(titleDiv);

      // Wenn Admin, zusätzliche Buttons anzeigen
      if (adminActive) {
        const delBtn = document.createElement("span");
        delBtn.classList.add("deletePostBtn");
        delBtn.textContent = "🗑️";
        delBtn.title = "Delete";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removePost(post.id);
        });
        card.appendChild(delBtn);

        const editBtn = document.createElement("span");
        editBtn.classList.add("editPostBtn");
        editBtn.textContent = "✏️";
        editBtn.title = "Edit";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditForm(post.id);
        });
        card.appendChild(editBtn);
      }

      // Klick auf Karte öffnet das Detail‑Panel
      card.addEventListener("click", () => openDetail(post.id));
      postsContainer.appendChild(card);
    });
  }

  /**
   * Entfernt einen Post nach Bestätigung.
   * @param {number} id Post‑ID
   */
  function openConfirm(message, onConfirm) {
    confirmCallback = onConfirm;
    confirmMessage.textContent = message;
    confirmOverlay.classList.remove("hidden");
  }

  function removePost(id) {
    openConfirm("Delete this post?", () => {
      posts = posts.filter((p) => p.id !== id);
      savePosts();
      renderPosts();
    });
  }

  /**
   * Öffnet das Formular zum Bearbeiten oder Erstellen eines Posts.
   * @param {number|null} id ID des zu bearbeitenden Posts oder null für neuen Post
   */
  function openEditForm(id) {
    editId = id;
    if (id !== null) {
      const post = posts.find((p) => p.id === id);
      if (post) {
        postTitleInput.value = post.title;
        postCoverInput.value = post.cover;
        postAccInput.value = atob(post.acc);
        postPwInput.value = atob(post.pw);
      }
    } else {
      // Neue Werte löschen
      postTitleInput.value = "";
      postCoverInput.value = "";
      postAccInput.value = "";
      postPwInput.value = "";
    }
    postForm.classList.remove("hidden");
  }

  /**
   * Fügt einen neuen Post hinzu oder aktualisiert einen bestehenden.
   */
  function savePost() {
    const title = postTitleInput.value.trim();
    const cover = postCoverInput.value.trim();
    const acc = postAccInput.value.trim();
    const pw = postPwInput.value.trim();
    if (!title || !acc || !pw) {
      showToast("Title, account and password must not be empty.");
      return;
    }
    if (editId !== null) {
      // Bearbeiten
      const idx = posts.findIndex((p) => p.id === editId);
      if (idx >= 0) {
        posts[idx].title = title;
        posts[idx].cover = cover;
        posts[idx].acc = btoa(acc);
        posts[idx].pw = btoa(pw);
      }
    } else {
      // Neuer Post
      posts.push({
        id: Date.now(),
        title,
        cover,
        acc: btoa(acc),
        pw: btoa(pw),
      });
    }
    savePosts();
    renderPosts();
    postForm.classList.add("hidden");
    editId = null;
    showToast("Post saved.");
  }

  /**
   * Öffnet das Detail‑Panel und füllt die Daten eines Posts ein.
   * @param {number} id Post‑ID
   */
  function openDetail(id) {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    detailTitle.textContent = post.title;
    detailCover.style.backgroundImage = post.cover ? `url('${post.cover}')` : "none";
    // Temporär maskieren; tatsächliche Werte erst beim Kopieren anzeigen
    detailAcc.classList.add("masked");
    detailPw.classList.add("masked");
    detailAcc.textContent = "••••••••";
    detailPw.textContent = "••••••••";
    detailAcc.dataset.value = atob(post.acc);
    detailPw.dataset.value = atob(post.pw);
    detailPanel.classList.remove("hidden");
  }

  /**
   * Schließt das Detail‑Panel.
   */
  function closeDetail() {
    detailPanel.classList.add("hidden");
  }

  /**
   * Kopiert die angegebene Anmeldeinformation und blendet sie kurz ein.
   * @param {HTMLElement} element Element mit dataset.value
   */
  function copyDetail(element) {
    const value = element.dataset.value;
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        element.classList.remove("masked");
        element.textContent = value;
        setTimeout(() => {
          element.classList.add("masked");
          element.textContent = "••••••••";
        }, 2500);
      })
      .catch(() => {
        showToast("Failed to copy.");
      });
  }

  /**
   * Handler für die Eingabe des Entsperrcodes. Prüft nach 2 s ohne weitere
   * Eingabe, ob der Code korrekt ist. Ist er falsch, wird eine Meldung
   * angezeigt und das Feld geleert.
   */
  function onUnlockInput() {
    clearTimeout(unlockTimer);
    unlockMessage.textContent = "";
    unlockTimer = setTimeout(async () => {
      const input = unlockInput.value.trim();
      if (!input) return;
      const hash = await hashString(input);
      if (hash === unlockHash) {
        // Success: hide overlay and show app
        unlockOverlay.style.display = "none";
        app.classList.remove("hidden");
      } else {
        unlockMessage.textContent = "Incorrect combination.";
        unlockInput.value = "";
      }
    }, 2000);
  }

  /**
   * Versucht, in den Admin‑Modus zu wechseln, indem nach dem Admin‑Code
   * gefragt wird. Erfolgreich eingegebenes Passwort aktiviert den Modus und
   * zeigt die Admin‑Steuerung an.
   */
  function onAdminTrigger() {
    // Prepare admin overlay for input
    adminInput.value = "";
    adminMessage.textContent = "";
    adminOverlay.classList.remove("hidden");
    // Focus after next tick
    setTimeout(() => {
      adminInput.focus();
    }, 0);
  }

  async function verifyAdminCode() {
    const entered = adminInput.value.trim();
    if (!entered) return;
    const hash = await hashString(entered);
    if (hash === adminHash) {
      adminActive = true;
      adminControls.classList.remove("hidden");
      document.body.classList.add("admin-active");
      adminOverlay.classList.add("hidden");
      renderPosts();
    } else {
      adminMessage.textContent = "Incorrect admin code.";
      adminInput.value = "";
    }
  }

  // Event listeners
  unlockInput.addEventListener("input", onUnlockInput);
  adminTrigger.addEventListener("click", onAdminTrigger);
  adminSubmit.addEventListener("click", verifyAdminCode);
  adminInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      verifyAdminCode();
    }
  });
  addPostBtn.addEventListener("click", () => openEditForm(null));
  savePostBtn.addEventListener("click", savePost);
  cancelPostBtn.addEventListener("click", () => {
    postForm.classList.add("hidden");
    editId = null;
  });
  closeDetailBtn.addEventListener("click", closeDetail);
  copyDetailAcc.addEventListener("click", () => copyDetail(detailAcc));
  copyDetailPw.addEventListener("click", () => copyDetail(detailPw));
  confirmYes.addEventListener("click", () => {
    if (confirmCallback) {
      const cb = confirmCallback;
      confirmCallback = null;
      confirmOverlay.classList.add("hidden");
      cb();
    }
  });
  confirmNo.addEventListener("click", () => {
    confirmCallback = null;
    confirmOverlay.classList.add("hidden");
  });
  // Storage event for live updates across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === "postit_posts") {
      try {
        posts = JSON.parse(e.newValue || "[]");
      } catch (err) {
        posts = [];
      }
      renderPosts();
    }
  });
  // Toast helper
  function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    // Use a short timeout to allow CSS transitions
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
      }, 300);
    }, duration);
  }
  // Initialize when the page loads
  window.addEventListener("load", init);
  // ESC key closes the detail panel or admin overlay/confirm overlay
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!detailPanel.classList.contains("hidden")) {
        closeDetail();
      }
      if (!adminOverlay.classList.contains("hidden")) {
        adminOverlay.classList.add("hidden");
      }
      if (!confirmOverlay.classList.contains("hidden")) {
        confirmCallback = null;
        confirmOverlay.classList.add("hidden");
      }
    }
  });
})();