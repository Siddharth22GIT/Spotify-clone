document.querySelectorAll(".card .play").forEach(playDiv => {
    playDiv.addEventListener("click", () => {
        let audio = playDiv.querySelector("audio");
        let icon = playDiv.querySelector("img");

        if (audio.paused) {
            audio.play();
            icon.src = "pause.svg"; 
            
        } else {
            audio.pause();
            icon.src = "play.svg"; 
        }
    });
});

document.querySelectorAll(".song").forEach(playDiv => {
    playDiv.addEventListener("click", () => {
        let adio = playDiv.querySelector("audio");

        if (adio.paused) {
            adio.play();
            
        } else {
            adio.pause();
        }
    });
});

