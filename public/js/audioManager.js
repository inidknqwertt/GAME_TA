const bgm = document.getElementById("bgm");

if (bgm) {
    bgm.volume = 0.5;
}

window.pauseBGM = function () {
    if (bgm) bgm.pause();
}

window.resumeBGM = function () {
    if (bgm) bgm.play();
}