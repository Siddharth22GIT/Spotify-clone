// ===============================
// SONG PLAYER
// ===============================

const songs = Array.from(document.querySelectorAll(".card")).map((card) => {
    const audio = card.querySelector("audio");

    return {
        title: card.textContent.trim(),
        src: audio.src,
        card: card
    };
});

let currentSongIndex = -1;
let currentAudio = null;


// ===============================
// CREATE PLAYER BAR
// ===============================

const player = document.createElement("div");
player.className = "player";
player.innerHTML = `
    <div class="player-top">
        <div class="player-song-info">
            <span class="player-title">No song selected</span>
        </div>

        <div class="controls">
            <button class="previous-btn">⏮</button>
            <button class="main-play-btn">▶</button>
            <button class="next-btn">⏭</button>
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
        <span class="current-time">0:00</span>

        <input
            class="progress"
            type="range"
            min="0"
            max="100"
            value="0"
            step="0.1"
        >

        <span class="duration">0:00</span>
    </div>
`;

document.querySelector(".right").appendChild(player);


// ===============================
// PLAYER ELEMENTS
// ===============================

const mainPlayBtn = player.querySelector(".main-play-btn");
const previousBtn = player.querySelector(".previous-btn");
const nextBtn = player.querySelector(".next-btn");

const progress = player.querySelector(".progress");
const volume = player.querySelector(".volume");

const currentTimeText = player.querySelector(".current-time");
const durationText = player.querySelector(".duration");

const playerTitle = player.querySelector(".player-title");


// ===============================
// FORMAT TIME
// ===============================

function formatTime(seconds) {
    if (!isFinite(seconds)) {
        return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`;
}


// ===============================
// LOAD SONG
// ===============================

function loadSong(index, shouldPlay = true) {

    if (index < 0 || index >= songs.length) {
        return;
    }

    currentSongIndex = index;

    // Stop previous audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(songs[index].src);

    currentAudio.volume = volume.value;

    playerTitle.textContent = `Song ${index + 1}`;

    player.classList.add("active");

    // Reset progress
    progress.value = 0;
    currentTimeText.textContent = "0:00";
    durationText.textContent = "0:00";

    // Update duration once metadata loads
    currentAudio.addEventListener("loadedmetadata", () => {
        progress.max = currentAudio.duration;
        durationText.textContent = formatTime(currentAudio.duration);
    });

    // Update progress while playing
    currentAudio.addEventListener("timeupdate", () => {

        progress.max = currentAudio.duration || 100;

        progress.value = currentAudio.currentTime;

        currentTimeText.textContent =
            formatTime(currentAudio.currentTime);
    });

    // Automatically play next song
    currentAudio.addEventListener("ended", () => {

        if (currentSongIndex < songs.length - 1) {
            loadSong(currentSongIndex + 1, true);
        } else {
            mainPlayBtn.textContent = "▶";
        }
    });

    if (shouldPlay) {
        currentAudio.play()
            .then(() => {
                mainPlayBtn.textContent = "⏸";
            })
            .catch(() => {
                mainPlayBtn.textContent = "▶";
            });
    }
}


// ===============================
// PLAY / PAUSE
// ===============================

mainPlayBtn.addEventListener("click", () => {

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
});


// ===============================
// PREVIOUS
// ===============================

previousBtn.addEventListener("click", () => {

    if (currentSongIndex > 0) {
        loadSong(currentSongIndex - 1, true);
    }
});


// ===============================
// NEXT
// ===============================

nextBtn.addEventListener("click", () => {

    if (currentSongIndex < songs.length - 1) {
        loadSong(currentSongIndex + 1, true);
    }
});


// ===============================
// PROGRESS / SEEK
// ===============================

progress.addEventListener("input", () => {

    if (!currentAudio) {
        return;
    }

    currentAudio.currentTime = progress.value;
});


// ===============================
// VOLUME
// ===============================

volume.addEventListener("input", () => {

    if (!currentAudio) {
        return;
    }

    currentAudio.volume = volume.value;
});


// ===============================
// LEFT LIBRARY SONGS
// ===============================

document.querySelectorAll(".song").forEach((song, index) => {

    song.addEventListener("click", () => {

        loadSong(index, true);

    });

});


// ===============================
// CARD PLAY BUTTONS
// ===============================

document.querySelectorAll(".card .play").forEach((playDiv, index) => {

    playDiv.addEventListener("click", (event) => {

        // Prevent the card click from interfering
        event.stopPropagation();

        if (currentSongIndex !== index) {

            loadSong(index, true);

            return;
        }

        if (!currentAudio) {
            loadSong(index, true);
            return;
        }

        if (currentAudio.paused) {

            currentAudio.play();

            mainPlayBtn.textContent = "⏸";

        } else {

            currentAudio.pause();

            mainPlayBtn.textContent = "▶";
        }
    });

});


// ===============================
// UPDATE CARD PLAY ICONS
// ===============================

setInterval(() => {

    document.querySelectorAll(".card .play").forEach((playDiv, index) => {

        const icon = playDiv.querySelector("img");

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

}, 200);