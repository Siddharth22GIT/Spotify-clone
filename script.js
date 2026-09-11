// ============================================
// SONG DATA
// ============================================

const originalCards = Array.from(
    document.querySelectorAll(".card")
);

let songs = originalCards.map((card, index) => {

    const audio = card.querySelector("audio");

    return {
        id: `builtin-${index + 1}`,
        title: `Song ${index + 1}`,
        src: audio.src,
        poster: card.querySelector("img").src,
        custom: false
    };

});

const USERS_KEY = "gotoSongUsers";
const CURRENT_USER_KEY = "gotoSongCurrentUser";
const LEGACY_MIGRATED_KEY = "gotoSongLegacyMigrated";
const DELETED_SONGS_KEY = "spotifyDeletedSongs";
const PLAYLISTS_KEY = "spotifyPlaylists";
const SONG_DB_NAME = "gotoSongDatabase";
const SONG_STORE_NAME = "customSongs";

let currentUser = JSON.parse(
    localStorage.getItem(CURRENT_USER_KEY) || "null"
);

let deletedSongIds = new Set();

const objectUrls = new Map();


// ============================================
// INDEXED DB - CUSTOM SONG STORAGE
// ============================================

function openSongDatabase() {

    return new Promise((resolve, reject) => {

        if (!window.indexedDB) {
            reject(
                new Error("IndexedDB is not supported by this browser.")
            );
            return;
        }

        const request = indexedDB.open(
            SONG_DB_NAME,
            2
        );

        request.onupgradeneeded = event => {

            const db = event.target.result;

            if (!db.objectStoreNames.contains(SONG_STORE_NAME)) {
                db.createObjectStore(
                    SONG_STORE_NAME,
                    { keyPath: "id" }
                );
            }

        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };

    });

}


function getCustomSongsFromDatabase() {

    return openSongDatabase().then(db => {

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                SONG_STORE_NAME,
                "readonly"
            );

            const store = transaction.objectStore(
                SONG_STORE_NAME
            );

            const request = store.getAll();

            request.onsuccess = () => {
                const records = request.result || [];

                resolve(
                    currentUser
                        ? records.filter(
                            song => song.userId === currentUser.id
                        )
                        : []
                );
            };

            request.onerror = () => {
                reject(request.error);
            };

            transaction.oncomplete = () => {
                db.close();
            };

        });

    });

}


function saveCustomSongToDatabase(songRecord) {

    return openSongDatabase().then(db => {

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                SONG_STORE_NAME,
                "readwrite"
            );

            const record = {
                ...songRecord,
                userId: currentUser.id
            };

            transaction.objectStore(
                SONG_STORE_NAME
            ).put(record);

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };

        });

    });

}


function deleteCustomSongFromDatabase(songId) {

    return openSongDatabase().then(db => {

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                SONG_STORE_NAME,
                "readwrite"
            );

            transaction.objectStore(
                SONG_STORE_NAME
            ).delete(songId);

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };

        });

    });

}


// ============================================
// CLAIM LEGACY CUSTOM SONGS
// ============================================

function claimLegacyCustomSongs(userId) {

    return openSongDatabase().then(db => {

        return new Promise((resolve, reject) => {

            const transaction = db.transaction(
                SONG_STORE_NAME,
                "readwrite"
            );

            const store = transaction.objectStore(
                SONG_STORE_NAME
            );

            const request = store.getAll();

            request.onsuccess = () => {

                (request.result || []).forEach(song => {

                    if (!song.userId) {
                        song.userId = userId;
                        store.put(song);
                    }

                });

            };

            request.onerror = () => {
                reject(request.error);
            };

            transaction.oncomplete = () => {
                db.close();
                resolve();
            };

            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };

        });

    });

}


// ============================================
// MUSIC PLAYER
// ============================================

let currentSongIndex = -1;
let currentSongId = null;
let currentAudio = null;
let visibleSongIndexes = [];


// ============================================
// CREATE PLAYER
// ============================================

const player = document.createElement("div");

player.className = "player";

player.innerHTML = `

    <div class="player-top">

        <div class="player-song-info">

            <span class="player-title">
                No song selected
            </span>

        </div>

        <div class="controls">

            <button
                class="previous-btn"
                type="button"
            >
                ⏮
            </button>

            <button
                class="main-play-btn"
                type="button"
            >
                ▶
            </button>

            <button
                class="next-btn"
                type="button"
            >
                ⏭
            </button>

        </div>

        <div class="volume-container">

            <span>🔊</span>

            <input
                class="volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value="1"
            >

        </div>

    </div>

    <div class="progress-container">

        <span class="current-time">
            0:00
        </span>

        <input
            class="progress"
            type="range"
            min="0"
            max="100"
            value="0"
            step="0.1"
        >

        <span class="duration">
            0:00
        </span>

    </div>

`;

document
    .querySelector(".right")
    .appendChild(player);


// ============================================
// PLAYER ELEMENTS
// ============================================

const mainPlayBtn =
    player.querySelector(".main-play-btn");

const previousBtn =
    player.querySelector(".previous-btn");

const nextBtn =
    player.querySelector(".next-btn");

const progress =
    player.querySelector(".progress");

const volume =
    player.querySelector(".volume");

const currentTimeText =
    player.querySelector(".current-time");

const durationText =
    player.querySelector(".duration");

const playerTitle =
    player.querySelector(".player-title");


// ============================================
// FORMAT TIME
// ============================================

function formatTime(seconds) {

    if (!isFinite(seconds)) {
        return "0:00";
    }

    const minutes =
        Math.floor(seconds / 60);

    const remainingSeconds =
        Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`;

}


// ============================================
// LOAD SONG
// ============================================

function loadSong(index, shouldPlay = true) {

    if (
        index < 0 ||
        index >= songs.length
    ) {
        return;
    }

    currentSongIndex = index;
    currentSongId = songs[index].id;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(songs[index].src);

    currentAudio.volume =
        Number(volume.value);

    playerTitle.textContent =
        songs[index].title;

    player.classList.add("active");

    progress.value = 0;
    currentTimeText.textContent = "0:00";
    durationText.textContent = "0:00";

    currentAudio.addEventListener(
        "loadedmetadata",
        () => {

            progress.max =
                currentAudio.duration || 100;

            durationText.textContent =
                formatTime(currentAudio.duration);

        }
    );

    currentAudio.addEventListener(
        "timeupdate",
        () => {

            progress.max =
                currentAudio.duration || 100;

            progress.value =
                currentAudio.currentTime;

            currentTimeText.textContent =
                formatTime(currentAudio.currentTime);

        }
    );

    currentAudio.addEventListener(
        "ended",
        () => {

            const position =
                visibleSongIndexes.indexOf(currentSongIndex);

            if (
                position !== -1 &&
                position < visibleSongIndexes.length - 1
            ) {

                loadSong(
                    visibleSongIndexes[position + 1],
                    true
                );

            } else {

                mainPlayBtn.textContent = "▶";

            }

        }
    );

    if (shouldPlay) {

        currentAudio
            .play()
            .then(() => {
                mainPlayBtn.textContent = "⏸";
            })
            .catch(() => {
                mainPlayBtn.textContent = "▶";
            });

    }

}


// ============================================
// PLAY / PAUSE
// ============================================

mainPlayBtn.addEventListener(
    "click",
    () => {

        if (!currentAudio) {
            return;
        }

        if (currentAudio.paused) {

            currentAudio.play();
            mainPlayBtn.textContent = "⏸";

        } else {

            currentAudio.pause();
            mainPlayBtn.textContent = "▶";

        }

    }
);


// ============================================
// PREVIOUS
// ============================================

previousBtn.addEventListener(
    "click",
    () => {

        const position =
            visibleSongIndexes.indexOf(currentSongIndex);

        if (position > 0) {

            loadSong(
                visibleSongIndexes[position - 1],
                true
            );

        }

    }
);


// ============================================
// NEXT
// ============================================

nextBtn.addEventListener(
    "click",
    () => {

        const position =
            visibleSongIndexes.indexOf(currentSongIndex);

        if (
            position !== -1 &&
            position < visibleSongIndexes.length - 1
        ) {

            loadSong(
                visibleSongIndexes[position + 1],
                true
            );

        }

    }
);


// ============================================
// PROGRESS
// ============================================

progress.addEventListener(
    "input",
    () => {

        if (!currentAudio) {
            return;
        }

        currentAudio.currentTime =
            Number(progress.value);

    }
);


// ============================================
// VOLUME
// ============================================

volume.addEventListener(
    "input",
    () => {

        if (!currentAudio) {
            return;
        }

        currentAudio.volume =
            Number(volume.value);

    }
);


// ============================================
// PLAYLIST ELEMENTS
// ============================================

let activePlaylistIndex = -1;
let selectedPlaylistIndex = -1;

const contentHeading =
    document.querySelector("#contentHeading");

const songHolder =
    document.querySelector("#songHolder");

const playlistMenu =
    document.querySelector(".playlist-menu");

const playlistButton =
    document.querySelector(".playlist-btn");

const playlistList =
    document.querySelector(".playlist-list");

const playlistView =
    document.querySelector(".playlist-view");

const playlistEditor =
    document.querySelector(".playlist-editor");

const newPlaylistButton =
    document.querySelector(".new-playlist-btn");

const allSongsButton =
    document.querySelector(".all-songs-btn");

const backPlaylistButton =
    document.querySelector(".back-playlist-btn");

const selectedPlaylistName =
    document.querySelector(".selected-playlist-name");

const addSongInput =
    document.querySelector(".add-song-input");

const addSongButton =
    document.querySelector(".add-song-btn");

const playlistSongs =
    document.querySelector(".playlist-songs");


let playlists = [];


// ============================================
// HOME ADD SONG ELEMENTS
// ============================================

const addHomeSongBtn =
    document.querySelector("#addHomeSongBtn");

const addSongModal =
    document.querySelector("#addSongModal");

const closeAddSongBtn =
    document.querySelector("#closeAddSongBtn");

const addSongForm =
    document.querySelector("#addSongForm");

const newSongName =
    document.querySelector("#newSongName");

const newSongFile =
    document.querySelector("#newSongFile");

const newSongBanner =
    document.querySelector("#newSongBanner");


// ============================================
// AUTHENTICATION ELEMENTS
// ============================================

const authButtons =
    document.querySelector("#authButtons");

const signupOpenBtn =
    document.querySelector("#signupOpenBtn");

const loginOpenBtn =
    document.querySelector("#loginOpenBtn");

const signupModal =
    document.querySelector("#signupModal");

const loginModal =
    document.querySelector("#loginModal");

const closeSignupBtn =
    document.querySelector("#closeSignupBtn");

const closeLoginBtn =
    document.querySelector("#closeLoginBtn");

const signupForm =
    document.querySelector("#signupForm");

const loginForm =
    document.querySelector("#loginForm");

const signupName =
    document.querySelector("#signupName");

const signupEmail =
    document.querySelector("#signupEmail");

const signupPassword =
    document.querySelector("#signupPassword");

const signupConfirmPassword =
    document.querySelector("#signupConfirmPassword");

const loginEmail =
    document.querySelector("#loginEmail");

const loginPassword =
    document.querySelector("#loginPassword");

const signupMessage =
    document.querySelector("#signupMessage");

const loginMessage =
    document.querySelector("#loginMessage");

const switchToLoginBtn =
    document.querySelector("#switchToLoginBtn");

const switchToSignupBtn =
    document.querySelector("#switchToSignupBtn");


// ============================================
// AUTHENTICATION
// ============================================

function getUsers() {

    return JSON.parse(
        localStorage.getItem(USERS_KEY) || "[]"
    );

}


function saveUsers(users) {

    localStorage.setItem(
        USERS_KEY,
        JSON.stringify(users)
    );

}


async function hashPassword(password) {

    if (window.crypto?.subtle) {

        const data =
            new TextEncoder().encode(password);

        const hashBuffer =
            await crypto.subtle.digest(
                "SHA-256",
                data
            );

        return Array.from(
            new Uint8Array(hashBuffer)
        )
            .map(byte =>
                byte.toString(16).padStart(2, "0")
            )
            .join("");
    }

    // Fallback for environments without Web Crypto.
    let hash = 0;

    for (let i = 0; i < password.length; i++) {
        hash =
            ((hash << 5) - hash) +
            password.charCodeAt(i);
        hash |= 0;
    }

    return `fallback-${Math.abs(hash)}`;

}


function setAuthMessage(element, message, success = false) {

    element.textContent = message;
    element.classList.toggle("success", success);

}


function openAuthModal(modal) {

    closeAuthModals();

    modal.classList.add("auth-modal-visible");
    modal.setAttribute("aria-hidden", "false");

}


function closeAuthModal(modal) {

    modal.classList.remove("auth-modal-visible");
    modal.setAttribute("aria-hidden", "true");

}


function closeAuthModals() {

    closeAuthModal(signupModal);
    closeAuthModal(loginModal);

}


function requireLogin() {

    if (currentUser) {
        return true;
    }

    openAuthModal(loginModal);
    setAuthMessage(
        loginMessage,
        "Log in to use your personal library and playlists."
    );

    return false;

}


function renderAuthButtons() {

    authButtons.innerHTML = "";

    if (!currentUser) {

        const signupWrap =
            document.createElement("div");
        signupWrap.className = "signupbtn";

        const signupButton =
            document.createElement("button");
        signupButton.type = "button";
        signupButton.textContent = "Sign up";
        signupButton.addEventListener(
            "click",
            () => openAuthModal(signupModal)
        );

        signupWrap.appendChild(signupButton);

        const loginWrap =
            document.createElement("div");
        loginWrap.className = "loginbtn";

        const loginButton =
            document.createElement("button");
        loginButton.type = "button";
        loginButton.textContent = "Log in";
        loginButton.addEventListener(
            "click",
            () => openAuthModal(loginModal)
        );

        loginWrap.appendChild(loginButton);

        authButtons.appendChild(signupWrap);
        authButtons.appendChild(loginWrap);

        return;
    }

    const userName =
        document.createElement("span");
    userName.className = "auth-user-name";
    userName.textContent = `Hi, ${currentUser.name}`;
    userName.title = currentUser.name;

    const logoutButton =
        document.createElement("button");
    logoutButton.className = "logout-btn";
    logoutButton.type = "button";
    logoutButton.textContent = "Log out";

    logoutButton.addEventListener(
        "click",
        logoutUser
    );

    authButtons.appendChild(userName);
    authButtons.appendChild(logoutButton);

}


function migrateLegacyLocalData(userId) {

    if (localStorage.getItem(LEGACY_MIGRATED_KEY)) {
        return;
    }

    const oldPlaylists =
        JSON.parse(
            localStorage.getItem(PLAYLISTS_KEY) || "[]"
        );

    const oldDeletedSongs =
        JSON.parse(
            localStorage.getItem(DELETED_SONGS_KEY) || "[]"
        );

    const userPlaylistKey =
        `${PLAYLISTS_KEY}_${userId}`;

    const userDeletedKey =
        `${DELETED_SONGS_KEY}_${userId}`;

    if (!localStorage.getItem(userPlaylistKey)) {
        localStorage.setItem(
            userPlaylistKey,
            JSON.stringify(oldPlaylists)
        );
    }

    if (!localStorage.getItem(userDeletedKey)) {
        localStorage.setItem(
            userDeletedKey,
            JSON.stringify(oldDeletedSongs)
        );
    }

    localStorage.setItem(
        LEGACY_MIGRATED_KEY,
        "true"
    );

}


async function loginUser(email, password) {

    const users = getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const user = users.find(
        savedUser =>
            savedUser.email === normalizedEmail &&
            savedUser.passwordHash === passwordHash
    );

    if (!user) {
        throw new Error("Incorrect email or password.");
    }

    currentUser = {
        id: user.id,
        name: user.name,
        email: user.email
    };

    localStorage.setItem(
        CURRENT_USER_KEY,
        JSON.stringify(currentUser)
    );

    loadUserData();
    await refreshSongs();
    renderPlaylists();
    showAllSongs();
    renderAuthButtons();

}


async function logoutUser() {

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    currentSongIndex = -1;
    currentSongId = null;
    player.classList.remove("active");
    mainPlayBtn.textContent = "▶";

    closeAuthModals();

    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);

    loadUserData();
    await refreshSongs();
    renderPlaylists();
    showAllSongs();
    renderAuthButtons();

}


async function createAccount() {

    const name = signupName.value.trim();
    const email = signupEmail.value.trim().toLowerCase();
    const password = signupPassword.value;
    const confirmPassword = signupConfirmPassword.value;

    if (!name || !email || !password || !confirmPassword) {
        setAuthMessage(
            signupMessage,
            "Please fill in all fields."
        );
        return;
    }

    if (password.length < 6) {
        setAuthMessage(
            signupMessage,
            "Password must be at least 6 characters."
        );
        return;
    }

    if (password !== confirmPassword) {
        setAuthMessage(
            signupMessage,
            "Passwords do not match."
        );
        return;
    }

    const users = getUsers();

    if (users.some(user => user.email === email)) {
        setAuthMessage(
            signupMessage,
            "An account with this email already exists."
        );
        return;
    }

    const id =
        `user-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    const passwordHash =
        await hashPassword(password);

    users.push({
        id,
        name,
        email,
        passwordHash
    });

    saveUsers(users);

    // Preserve any data created before authentication was added
    // for the first account only.
    if (users.length === 1) {
        migrateLegacyLocalData(id);
    }

    currentUser = { id, name, email };

    localStorage.setItem(
        CURRENT_USER_KEY,
        JSON.stringify(currentUser)
    );

    loadUserData();

    if (users.length === 1) {
        try {
            await claimLegacyCustomSongs(id);
        } catch (error) {
            console.error("Could not migrate older custom songs:", error);
        }
    }

    await refreshSongs();
    renderPlaylists();
    showAllSongs();
    renderAuthButtons();

    signupForm.reset();
    closeAuthModal(signupModal);

}


// ============================================
// AUTH EVENT LISTENERS
// ============================================

signupOpenBtn.addEventListener(
    "click",
    () => openAuthModal(signupModal)
);

loginOpenBtn.addEventListener(
    "click",
    () => openAuthModal(loginModal)
);

closeSignupBtn.addEventListener(
    "click",
    () => closeAuthModal(signupModal)
);

closeLoginBtn.addEventListener(
    "click",
    () => closeAuthModal(loginModal)
);

switchToLoginBtn.addEventListener(
    "click",
    () => {
        signupForm.reset();
        setAuthMessage(signupMessage, "");
        openAuthModal(loginModal);
    }
);

switchToSignupBtn.addEventListener(
    "click",
    () => {
        loginForm.reset();
        setAuthMessage(loginMessage, "");
        openAuthModal(signupModal);
    }
);

signupModal.addEventListener(
    "click",
    event => {
        if (event.target === signupModal) {
            closeAuthModal(signupModal);
        }
    }
);

loginModal.addEventListener(
    "click",
    event => {
        if (event.target === loginModal) {
            closeAuthModal(loginModal);
        }
    }
);

signupForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        try {
            await createAccount();
        } catch (error) {
            console.error(error);
            setAuthMessage(
                signupMessage,
                "Could not create the account. Please try again."
            );
        }
    }
);

loginForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        try {
            await loginUser(
                loginEmail.value,
                loginPassword.value
            );

            loginForm.reset();
            setAuthMessage(loginMessage, "");
            closeAuthModal(loginModal);

        } catch (error) {
            setAuthMessage(
                loginMessage,
                error.message || "Could not log in."
            );
        }
    }
);

document.addEventListener(
    "keydown",
    event => {
        if (event.key !== "Escape") {
            return;
        }

        closeAuthModals();
    }
);


// ============================================
// SAVE PLAYLISTS
// ============================================

function getUserStorageKey(baseKey) {

    return currentUser
        ? `${baseKey}_${currentUser.id}`
        : null;

}


function savePlaylists() {

    const key = getUserStorageKey(PLAYLISTS_KEY);

    if (!key) {
        return;
    }

    localStorage.setItem(
        key,
        JSON.stringify(playlists)
    );

}


function saveDeletedSongIds() {

    const key = getUserStorageKey(DELETED_SONGS_KEY);

    if (!key) {
        return;
    }

    localStorage.setItem(
        key,
        JSON.stringify([...deletedSongIds])
    );

}


function loadUserData() {

    if (!currentUser) {
        playlists = [];
        deletedSongIds = new Set();
        return;
    }

    const playlistKey =
        getUserStorageKey(PLAYLISTS_KEY);

    const deletedKey =
        getUserStorageKey(DELETED_SONGS_KEY);

    playlists = JSON.parse(
        localStorage.getItem(playlistKey) || "[]"
    );

    deletedSongIds = new Set(
        JSON.parse(
            localStorage.getItem(deletedKey) || "[]"
        )
    );

}



// ============================================
// RENDER LIBRARY
// ============================================

function renderLibrary() {

    const list =
        document.querySelector(".list");

    list.innerHTML = "";

    songs.forEach((song, index) => {

        const songItem =
            document.createElement("div");

        songItem.className = "song";

        songItem.dataset.songIndex = index;

        const songName =
            document.createElement("span");

        songName.className = "library-song-name";
        songName.textContent = song.title;

        songItem.appendChild(songName);

        const deleteButton =
            document.createElement("button");

        deleteButton.className = "library-delete-btn";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete song";

        deleteButton.addEventListener(
            "click",
            event => {
                event.stopPropagation();
                deleteSongCompletely(song.id);
            }
        );

        songItem.appendChild(deleteButton);

        songItem.addEventListener(
            "click",
            () => {
                loadSong(index, true);
            }
        );

        list.appendChild(songItem);

    });

}


// ============================================
// CLEAN PLAYLISTS AFTER SONG DELETE
// ============================================

function removeSongFromAllPlaylists(songTitle) {

    const normalizedTitle =
        songTitle.toLowerCase();

    let changed = false;

    playlists.forEach(playlist => {

        const oldLength = playlist.songs.length;

        playlist.songs = playlist.songs.filter(
            song =>
                song.toLowerCase() !== normalizedTitle
        );

        if (playlist.songs.length !== oldLength) {
            changed = true;
        }

    });

    if (changed) {
        savePlaylists();
    }

}


// ============================================
// DELETE SONG FROM ALL SONGS
// ============================================

async function deleteSongCompletely(songId) {

    if (!requireLogin()) {
        return;
    }

    const songIndex =
        songs.findIndex(song => song.id === songId);

    if (songIndex === -1) {
        return;
    }

    const song = songs[songIndex];

    const confirmed =
        confirm(
            `Delete "${song.title}" from all songs?`
        );

    if (!confirmed) {
        return;
    }

    removeSongFromAllPlaylists(song.title);

    if (song.custom) {

        try {
            await deleteCustomSongFromDatabase(song.id);
        } catch (error) {
            console.error("Could not delete custom song:", error);
            alert("The song could not be deleted.");
            return;
        }

        const audioUrlKey = `${song.id}-audio`;
        const posterUrlKey = `${song.id}-poster`;

        const audioUrl = objectUrls.get(audioUrlKey);
        const posterUrl = objectUrls.get(posterUrlKey);

        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            objectUrls.delete(audioUrlKey);
        }

        if (posterUrl) {
            URL.revokeObjectURL(posterUrl);
            objectUrls.delete(posterUrlKey);
        }

    } else {

        deletedSongIds.add(song.id);
        saveDeletedSongIds();

    }

    if (currentSongId === song.id) {

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        currentSongIndex = -1;
        currentSongId = null;
        player.classList.remove("active");
        mainPlayBtn.textContent = "▶";

    }

    await refreshSongs();

    if (currentSongId) {
        currentSongIndex = songs.findIndex(
            currentSong => currentSong.id === currentSongId
        );
    }

    if (activePlaylistIndex !== -1) {

        if (
            activePlaylistIndex >= playlists.length
        ) {
            showAllSongs();
        } else {
            showPlaylist(activePlaylistIndex);
        }

    } else {
        showAllSongs();
    }

}


// ============================================
// REFRESH SONG DATA
// ============================================

async function refreshSongs() {

    const visibleBuiltInSongs =
        originalCards
            .map((card, index) => {

                const audio = card.querySelector("audio");

                return {
                    id: `builtin-${index + 1}`,
                    title: `Song ${index + 1}`,
                    src: audio.src,
                    poster: card.querySelector("img").src,
                    custom: false
                };

            })
            .filter(song => !deletedSongIds.has(song.id));

    let customSongs = [];

    try {
        customSongs = await getCustomSongsFromDatabase();
    } catch (error) {
        console.error("Could not load custom songs:", error);
    }

    customSongs = customSongs.map(song => {

        const audioUrlKey = `${song.id}-audio`;
        const posterUrlKey = `${song.id}-poster`;

        const existingAudioUrl =
            objectUrls.get(audioUrlKey);

        const audioUrl =
            existingAudioUrl ||
            URL.createObjectURL(song.audioBlob);

        if (!existingAudioUrl) {
            objectUrls.set(audioUrlKey, audioUrl);
        }

        const existingPosterUrl =
            objectUrls.get(posterUrlKey);

        const posterUrl =
            song.posterBlob
                ? (
                    existingPosterUrl ||
                    URL.createObjectURL(song.posterBlob)
                )
                : "";

        if (song.posterBlob && !existingPosterUrl) {
            objectUrls.set(posterUrlKey, posterUrl);
        }

        return {
            id: song.id,
            title: song.title,
            src: audioUrl,
            poster: posterUrl,
            custom: true
        };

    });

    songs = [
        ...visibleBuiltInSongs,
        ...customSongs
    ];

    visibleSongIndexes = getAllSongIndexes();

    renderLibrary();

}


// ============================================
// RENDER SONG CARDS
// ============================================

function renderSongCards(songIndexes) {

    visibleSongIndexes = [...songIndexes];

    songHolder.innerHTML = "";

    songIndexes.forEach(songIndex => {

        const song = songs[songIndex];

        if (!song) {
            return;
        }

        const card =
            document.createElement("div");

        card.className = "card";
        card.dataset.songIndex = songIndex;

        const poster =
            document.createElement("img");

        poster.src = song.poster;
        poster.alt = song.title;

        const play =
            document.createElement("div");

        play.className = "play";

        const audio =
            document.createElement("audio");

        audio.src = song.src;
        audio.preload = "metadata";

        const playIcon =
            document.createElement("img");

        playIcon.src = "play.svg";
        playIcon.alt = "Play";

        play.appendChild(audio);
        play.appendChild(playIcon);

        card.appendChild(poster);
        card.appendChild(play);

        // ========================================
        // DELETE BUTTON
        // ========================================

        const deleteButton =
            document.createElement("button");

        deleteButton.className =
            activePlaylistIndex === -1
                ? "playlist-card-delete global-delete"
                : "playlist-card-delete";

        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title =
            activePlaylistIndex === -1
                ? "Delete song"
                : "Remove from playlist";

        deleteButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                if (activePlaylistIndex === -1) {

                    deleteSongCompletely(song.id);

                } else {

                    deleteSongFromCurrentPlaylist(
                        song.title
                    );

                }

            }
        );

        card.appendChild(deleteButton);

        const title =
            document.createElement("div");

        title.className = "card-title";
        title.textContent = song.title;

        card.appendChild(title);

        play.addEventListener(
            "click",
            event => {

                event.stopPropagation();
                loadSong(songIndex, true);

            }
        );

        card.addEventListener(
            "click",
            () => {
                loadSong(songIndex, true);
            }
        );

        songHolder.appendChild(card);

    });

    // ============================================
    // ADD SONG CARD FOR PLAYLISTS
    // ============================================

    if (activePlaylistIndex !== -1) {

        const addCard =
            document.createElement("div");

        addCard.className = "add-song-card";

        addCard.innerHTML = `
            <div class="add-song-plus">+</div>
            <div class="add-song-text">Add Song</div>
        `;

        addCard.addEventListener(
            "click",
            () => {

                const songName =
                    prompt(
                        "Enter song name (for example: Song 6):"
                    );

                if (songName === null) {
                    return;
                }

                const cleanedName =
                    songName.trim();

                if (cleanedName === "") {
                    return;
                }

                const matchingSong =
                    songs.find(
                        song =>
                            song.title.toLowerCase() ===
                            cleanedName.toLowerCase()
                    );

                if (!matchingSong) {
                    alert(
                        "Song not found. Use an existing song name."
                    );
                    return;
                }

                const playlist =
                    playlists[activePlaylistIndex];

                const alreadyAdded =
                    playlist.songs.some(
                        song =>
                            song.toLowerCase() ===
                            matchingSong.title.toLowerCase()
                    );

                if (alreadyAdded) {
                    alert(
                        "This song is already in the playlist."
                    );
                    return;
                }

                playlist.songs.push(
                    matchingSong.title
                );

                savePlaylists();
                renderPlaylists();
                showPlaylist(activePlaylistIndex);

            }
        );

        songHolder.appendChild(addCard);

    }

}


// ============================================
// GET ALL SONG INDEXES
// ============================================

function getAllSongIndexes() {

    return songs.map(
        (_, index) => index
    );

}


// ============================================
// SHOW ALL SONGS
// ============================================

function showAllSongs() {

    activePlaylistIndex = -1;
    selectedPlaylistIndex = -1;

    contentHeading.textContent =
        "Trending songs";

    playlistButton.textContent =
        "My Playlists";

    renderSongCards(
        getAllSongIndexes()
    );

    searchInput.value = "";

    playlistView.classList.remove(
        "playlist-view-hidden"
    );

    playlistEditor.classList.remove(
        "playlist-editor-visible"
    );

    addHomeSongBtn.style.display = "inline-flex";

    playlistMenu.classList.remove(
        "playlist-open"
    );

}


// ============================================
// SHOW PLAYLIST
// ============================================

function showPlaylist(index) {

    if (
        index < 0 ||
        index >= playlists.length
    ) {
        return;
    }

    activePlaylistIndex = index;

    const playlist =
        playlists[index];

    contentHeading.textContent =
        playlist.name;

    playlistButton.textContent =
        playlist.name;

    const playlistSongIndexes =
        playlist.songs
            .map(songName => {

                return songs.findIndex(
                    song =>
                        song.title.toLowerCase() ===
                        songName.toLowerCase()
                );

            })
            .filter(index => index !== -1);

    renderSongCards(
        playlistSongIndexes
    );

    searchInput.value = "";

    addHomeSongBtn.style.display = "none";

}


// ============================================
// RENDER PLAYLISTS
// ============================================

function renderPlaylists() {

    playlistList.innerHTML = "";

    if (playlists.length === 0) {

        const empty =
            document.createElement("div");

        empty.className = "empty-playlists";
        empty.textContent = "No playlists yet";

        playlistList.appendChild(empty);

        return;

    }

    playlists.forEach(
        (playlist, index) => {

            const playlistItem =
                document.createElement("div");

            playlistItem.className =
                "playlist-item";

            const playlistIcon =
                document.createElement("span");

            playlistIcon.className =
                "playlist-icon";

            playlistIcon.textContent = "♫";

            const playlistText =
                document.createElement("span");

            playlistText.className =
                "playlist-item-name";

            playlistText.textContent =
                playlist.name;

            const playlistCount =
                document.createElement("span");

            playlistCount.className =
                "playlist-count";

            playlistCount.textContent =
                playlist.songs.length;

            playlistItem.appendChild(playlistIcon);
            playlistItem.appendChild(playlistText);
            playlistItem.appendChild(playlistCount);

            playlistItem.addEventListener(
                "click",
                event => {

                    event.stopPropagation();
                    openPlaylistEditor(index);

                }
            );

            playlistList.appendChild(
                playlistItem
            );

        }
    );

}


// ============================================
// OPEN PLAYLIST EDITOR
// ============================================

function openPlaylistEditor(index) {

    if (
        index < 0 ||
        index >= playlists.length
    ) {
        return;
    }

    activePlaylistIndex = index;
    selectedPlaylistIndex = index;

    showPlaylist(index);

    playlistView.classList.add(
        "playlist-view-hidden"
    );

    playlistEditor.classList.add(
        "playlist-editor-visible"
    );

    selectedPlaylistName.textContent =
        playlists[index].name;

    renderPlaylistSongs();

}


// ============================================
// BACK BUTTON
// ============================================

backPlaylistButton.addEventListener(
    "click",
    event => {

        event.stopPropagation();

        playlistEditor.classList.remove(
            "playlist-editor-visible"
        );

        playlistView.classList.remove(
            "playlist-view-hidden"
        );

        selectedPlaylistIndex = -1;

    }
);


// ============================================
// RENDER PLAYLIST SONGS
// ============================================

function renderPlaylistSongs() {

    playlistSongs.innerHTML = "";

    if (selectedPlaylistIndex === -1) {
        return;
    }

    const playlist =
        playlists[selectedPlaylistIndex];

    if (!playlist || playlist.songs.length === 0) {

        const empty =
            document.createElement("div");

        empty.className =
            "empty-playlist-songs";

        empty.textContent =
            "No songs added yet";

        playlistSongs.appendChild(empty);

        return;

    }

    playlist.songs.forEach(
        (songName, songIndex) => {

            const songItem =
                document.createElement("div");

            songItem.className =
                "playlist-song-item";

            const songNameElement =
                document.createElement("span");

            songNameElement.className =
                "playlist-song-name";

            songNameElement.textContent =
                songName;

            const deleteButton =
                document.createElement("button");

            deleteButton.className =
                "delete-song-btn";

            deleteButton.type = "button";
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    deleteSongFromPlaylist(
                        songIndex
                    );

                }
            );

            songItem.appendChild(
                songNameElement
            );

            songItem.appendChild(
                deleteButton
            );

            playlistSongs.appendChild(
                songItem
            );

        }
    );

}


// ============================================
// ADD SONG TO PLAYLIST
// ============================================

function addSongToPlaylist() {

    if (selectedPlaylistIndex === -1) {
        return;
    }

    const enteredName =
        addSongInput.value.trim();

    if (enteredName === "") {
        addSongInput.focus();
        return;
    }

    const matchingSong =
        songs.find(
            song =>
                song.title.toLowerCase() ===
                enteredName.toLowerCase()
        );

    if (!matchingSong) {

        alert(
            "Song not found. Use an existing song name."
        );

        return;

    }

    const playlist =
        playlists[selectedPlaylistIndex];

    const alreadyAdded =
        playlist.songs.some(
            song =>
                song.toLowerCase() ===
                matchingSong.title.toLowerCase()
        );

    if (alreadyAdded) {

        alert(
            "This song is already in the playlist."
        );

        return;

    }

    playlist.songs.push(
        matchingSong.title
    );

    savePlaylists();

    addSongInput.value = "";

    renderPlaylistSongs();
    renderPlaylists();

    showPlaylist(selectedPlaylistIndex);

}


addSongButton.addEventListener(
    "click",
    event => {

        event.stopPropagation();
        addSongToPlaylist();

    }
);


addSongInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            event.preventDefault();
            addSongToPlaylist();

        }

    }
);


// ============================================
// DELETE SONG FROM PLAYLIST
// ============================================

function deleteSongFromPlaylist(songIndex) {

    if (selectedPlaylistIndex === -1) {
        return;
    }

    const playlist =
        playlists[selectedPlaylistIndex];

    if (!playlist) {
        return;
    }

    playlist.songs.splice(
        songIndex,
        1
    );

    savePlaylists();

    renderPlaylistSongs();
    renderPlaylists();

    if (
        activePlaylistIndex ===
        selectedPlaylistIndex
    ) {

        showPlaylist(
            selectedPlaylistIndex
        );

    }

}


// ============================================
// DELETE SONG FROM CURRENT PLAYLIST CARD
// ============================================

function deleteSongFromCurrentPlaylist(songName) {

    if (activePlaylistIndex === -1) {
        return;
    }

    const playlist =
        playlists[activePlaylistIndex];

    if (!playlist) {
        return;
    }

    const songIndex =
        playlist.songs.findIndex(
            song =>
                song.toLowerCase() ===
                songName.toLowerCase()
        );

    if (songIndex === -1) {
        return;
    }

    const confirmed =
        confirm(
            `Remove "${songName}" from ${playlist.name}?`
        );

    if (!confirmed) {
        return;
    }

    playlist.songs.splice(
        songIndex,
        1
    );

    savePlaylists();
    renderPlaylists();
    renderPlaylistSongs();

    showPlaylist(
        activePlaylistIndex
    );

}


// ============================================
// CREATE NEW PLAYLIST
// ============================================

newPlaylistButton.addEventListener(
    "click",
    event => {

        event.stopPropagation();

        const playlistName =
            prompt(
                "Enter your playlist name:"
            );

        if (playlistName === null) {
            return;
        }

        const cleanedName =
            playlistName.trim();

        if (cleanedName === "") {

            alert(
                "Please enter a playlist name."
            );

            return;

        }

        const alreadyExists =
            playlists.some(
                playlist =>
                    playlist.name.toLowerCase() ===
                    cleanedName.toLowerCase()
            );

        if (alreadyExists) {

            alert(
                "A playlist with this name already exists."
            );

            return;

        }

        playlists.push({
            name: cleanedName,
            songs: []
        });

        savePlaylists();
        renderPlaylists();

        openPlaylistEditor(
            playlists.length - 1
        );

    }
);


// ============================================
// ALL SONGS BUTTON
// ============================================

allSongsButton.addEventListener(
    "click",
    event => {

        event.stopPropagation();
        showAllSongs();

    }
);


// ============================================
// PLAYLIST BUTTON
// ============================================

playlistButton.addEventListener(
    "click",
    event => {

        event.stopPropagation();

        if (!requireLogin()) {
            return;
        }

        playlistMenu.classList.toggle(
            "playlist-open"
        );

    }
);


// ============================================
// CLOSE PLAYLIST DROPDOWN
// ============================================

document.addEventListener(
    "click",
    event => {

        if (!playlistMenu.contains(event.target)) {

            playlistMenu.classList.remove(
                "playlist-open"
            );

        }

    }
);


// ============================================
// SEARCH
// ============================================

const searchInput =
    document.querySelector("#searchInput");

searchInput.addEventListener(
    "input",
    () => {

        const searchValue =
            searchInput.value
                .trim()
                .toLowerCase();

        const visibleCards =
            Array.from(
                document.querySelectorAll(
                    "#songHolder .card"
                )
            );

        visibleCards.forEach(card => {

            card.classList.remove(
                "search-highlight"
            );

        });

        if (searchValue === "") {
            return;
        }

        const foundCard =
            visibleCards.find(card => {

                const songName =
                    card
                        .querySelector(".card-title")
                        ?.textContent
                        .trim()
                        .toLowerCase() || "";

                return songName.includes(
                    searchValue
                );

            });

        if (foundCard) {

            foundCard.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });

            foundCard.classList.add(
                "search-highlight"
            );

            setTimeout(
                () => {
                    foundCard.classList.remove(
                        "search-highlight"
                    );
                },
                1200
            );

        }

    }
);


// ============================================
// UPDATE PLAY ICONS
// ============================================

setInterval(
    () => {

        document
            .querySelectorAll(
                "#songHolder .card"
            )
            .forEach(card => {

                const index =
                    Number(
                        card.dataset.songIndex
                    );

                const icon =
                    card.querySelector(
                        ".play img"
                    );

                if (!icon) {
                    return;
                }

                if (
                    currentSongIndex === index &&
                    currentAudio &&
                    !currentAudio.paused
                ) {

                    icon.src = "pause.svg";

                } else {

                    icon.src = "play.svg";

                }

            });

    },
    200
);


// ============================================
// ADD SONG MODAL
// ============================================

function openAddSongModal() {

    addSongModal.classList.add(
        "add-song-modal-visible"
    );

    addSongModal.setAttribute(
        "aria-hidden",
        "false"
    );

    setTimeout(() => {
        newSongName.focus();
    }, 0);

}


function closeAddSongModal() {

    addSongModal.classList.remove(
        "add-song-modal-visible"
    );

    addSongModal.setAttribute(
        "aria-hidden",
        "true"
    );

    addSongForm.reset();

}


addHomeSongBtn.addEventListener(
    "click",
    event => {

        event.stopPropagation();

        if (!requireLogin()) {
            return;
        }

        openAddSongModal();

    }
);


closeAddSongBtn.addEventListener(
    "click",
    event => {

        event.stopPropagation();
        closeAddSongModal();

    }
);


addSongModal.addEventListener(
    "click",
    event => {

        if (event.target === addSongModal) {
            closeAddSongModal();
        }

    }
);


document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            addSongModal.classList.contains(
                "add-song-modal-visible"
            )
        ) {
            closeAddSongModal();
        }

    }
);


// ============================================
// ADD CUSTOM SONG
// ============================================

addSongForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        if (!requireLogin()) {
            closeAddSongModal();
            return;
        }

        const title =
            newSongName.value.trim();

        const audioFile =
            newSongFile.files[0];

        const bannerFile =
            newSongBanner.files[0];

        if (!title || !audioFile || !bannerFile) {
            return;
        }

        if (!audioFile.type.startsWith("audio/")) {

            alert(
                "Please choose a valid audio file."
            );

            return;

        }

        if (!bannerFile.type.startsWith("image/")) {

            alert(
                "Please choose a valid image for the banner."
            );

            return;

        }

        const duplicate =
            songs.some(
                song =>
                    song.title.toLowerCase() ===
                    title.toLowerCase()
            );

        if (duplicate) {

            alert(
                "A song with this name already exists."
            );

            return;

        }

        const songRecord = {
            id:
                `custom-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}`,
            title: title,
            audioBlob: audioFile,
            posterBlob: bannerFile,
            createdAt: Date.now()
        };

        try {

            await saveCustomSongToDatabase(
                songRecord
            );

            await refreshSongs();

            showAllSongs();

            closeAddSongModal();

        } catch (error) {

            console.error(
                "Could not add custom song:",
                error
            );

            alert(
                "The song could not be added. Please try again."
            );

        }

    }
);


// ============================================
// INITIALIZE
// ============================================

async function initializeApp() {

    loadUserData();

    // Remove deleted built-in songs from the current user's playlists.
    const deletedTitles = new Set(
        originalCards
            .map((_, index) => ({
                id: `builtin-${index + 1}`,
                title: `Song ${index + 1}`
            }))
            .filter(song => deletedSongIds.has(song.id))
            .map(song => song.title.toLowerCase())
    );

    if (deletedTitles.size > 0) {

        playlists.forEach(playlist => {

            playlist.songs = playlist.songs.filter(
                song =>
                    !deletedTitles.has(
                        song.toLowerCase()
                    )
            );

        });

        savePlaylists();

    }

    await refreshSongs();

    renderPlaylists();
    renderAuthButtons();
    showAllSongs();

}


initializeApp();
