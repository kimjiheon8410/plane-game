// 게임 전체 로직을 즉시 실행 함수로 감싸 글로벌 스코프 오염 방지
(function () {
  // DOM 콘텐츠 로드 완료 후 게임 초기화
  document.addEventListener("DOMContentLoaded", function () {
    // DOM 요소 선택 헬퍼 함수
    const $ = (id) => document.getElementById(id);

    // 게임 요소 참조
    const planeElement = $("plane");
    const gameContainer = $("game-container");
    const scoreElement = $("score");
    const highScoreElement = $("high-score");
    const levelElement = $("level");
    const activePowerupElement = $("active-powerup");
    const finalScoreElement = $("final-score");
    const finalHighScoreElement = $("final-high-score");

    // 화면 및 버튼 참조
    const screens = {
      intro: $("intro-screen"),
      gameOver: $("game-over"),
      pause: $("pause-screen")
    };

    const buttons = {
      start: $("start-btn"),
      restart: $("restart-btn"),
      pause: $("pause-btn"),
      resume: $("resume-btn"),
      difficulty: {
        easy: $("easy-btn"),
        normal: $("normal-btn"),
        hard: $("hard-btn")
      }
    };

    // 난이도 설정값
    const difficultySettings = {
      easy: {
        baseSpeed: 3,
        gravity: 0.3,
        obstacleFrequency: 1800,
        enemyLevel: 4,
        powerupChance: 0.4,
        speedIncrease: 0.3
      },
      normal: {
        baseSpeed: 4,
        gravity: 0.4,
        obstacleFrequency: 1500,
        enemyLevel: 3,
        powerupChance: 0.25,
        speedIncrease: 0.5
      },
      hard: {
        baseSpeed: 5,
        gravity: 0.5,
        obstacleFrequency: 1200,
        enemyLevel: 2,
        powerupChance: 0.15,
        speedIncrease: 0.7
      }
    };

    // 게임 상태 변수
    let selectedDifficulty = "easy";
    let gameActive = false;
    let gamePaused = false;
    let gameSpeed, gravity, planeVelocity;
    let score = 0,
      highScore = 0,
      level = 1;
    let animationFrameId, obstacleInterval, powerupInterval;
    let obstacles = [],
      enemies = [],
      powerups = [],
      clouds = [];
    let lastCloudTime = 0;

    // 파워업 관련 변수
    let activePowerup = null;
    let powerupTimer = null;
    let pointsMultiplier = 1;

    // 비행기 속성
    const plane = {
      x: 50,
      y: null,
      width: 54,
      height: 27,
      lift: -8,
      hitboxReduction: 5,
      invincible: false
    };

    // 난이도 선택 함수
    function selectDifficulty(difficulty) {
      selectedDifficulty = difficulty;
      Object.values(buttons.difficulty).forEach((btn) =>
        btn.classList.remove("selected")
      );
      buttons.difficulty[difficulty].classList.add("selected");
    }

    // 난이도 버튼 이벤트 리스너
    Object.entries(buttons.difficulty).forEach(([diff, btn]) => {
      btn.addEventListener("click", () => selectDifficulty(diff));
    });

    // 최고 점수 로드
    function loadHighScore() {
      const saved = localStorage.getItem("flappyPlaneHighScore");
      if (saved) {
        highScore = parseInt(saved);
        highScoreElement.textContent = `최고점수: ${highScore}`;
        finalHighScoreElement.textContent = highScore;
      }
    }

    // 최고 점수 저장
    function saveHighScore() {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem("flappyPlaneHighScore", highScore);
        highScoreElement.textContent = `최고점수: ${highScore}`;
        finalHighScoreElement.textContent = highScore;
      }
    }

    // 일시정지 토글
    function togglePause() {
      if (!gameActive) return;

      gamePaused = !gamePaused;
      screens.pause.style.display = gamePaused ? "flex" : "none";

      if (gamePaused) {
        cancelAnimationFrame(animationFrameId);
        clearTimeout(obstacleInterval);
        clearTimeout(powerupInterval);
      } else {
        gameLoop();
        createObstacles();
        if (activePowerup && powerupTimer) {
          clearTimeout(powerupTimer);
          startPowerupTimer(
            activePowerup.duration - (Date.now() - activePowerup.startTime)
          );
        }
      }
    }

    // 파워업 활성화
    function activatePowerup(type) {
      deactivatePowerup();

      const duration = 8000;
      const startTime = Date.now();

      switch (type) {
        case "shield":
          activePowerup = { type, duration, startTime };
          planeElement.classList.add("shield-effect");
          plane.invincible = true;
          activePowerupElement.textContent = "파워업: 실드";
          activePowerupElement.style.color = "#3498db";
          break;
        case "slow":
          const originalSpeed = gameSpeed;
          gameSpeed *= 0.5;
          activePowerup = { type, duration, startTime, originalSpeed };
          activePowerupElement.textContent = "파워업: 슬로우";
          activePowerupElement.style.color = "#9b59b6";
          break;
        case "points":
          pointsMultiplier = 2;
          activePowerup = { type, duration, startTime };
          activePowerupElement.textContent = "파워업: 2배 점수";
          activePowerupElement.style.color = "#f1c40f";
          break;
      }

      activePowerupElement.style.display = "block";
      startPowerupTimer(duration);
    }

    // 파워업 타이머 시작
    function startPowerupTimer(duration) {
      if (powerupTimer) clearTimeout(powerupTimer);
      powerupTimer = setTimeout(deactivatePowerup, duration);
    }

    // 파워업 비활성화
    function deactivatePowerup() {
      if (!activePowerup) return;

      switch (activePowerup.type) {
        case "shield":
          planeElement.classList.remove("shield-effect");
          plane.invincible = false;
          break;
        case "slow":
          gameSpeed = activePowerup.originalSpeed;
          break;
        case "points":
          pointsMultiplier = 1;
          break;
      }

      activePowerup = null;
      powerupTimer = null;
      activePowerupElement.style.display = "none";
    }

    // 레벨 업 체크
    function checkLevelUp() {
      const newLevel = Math.floor(score / 10) + 1;

      if (newLevel > level) {
        level = newLevel;
        levelElement.textContent = `레벨: ${level}`;

        gameSpeed += difficultySettings[selectedDifficulty].speedIncrease;
      }
    }

    // 적 생성
    function createEnemy() {
      if (!gameActive || gamePaused) return;

      const enemy = document.createElement("div");
      enemy.className = "enemy game-element";

      const enemyY = Math.random() * (gameContainer.clientHeight - 20);
      enemy.style.top = `${enemyY}px`;

      enemy.moveSpeed = gameSpeed * 1.2;
      enemy.verticalDirection = Math.random() > 0.5 ? 1 : -1;
      enemy.verticalSpeed = Math.random() * 2 + 1;

      gameContainer.appendChild(enemy);
      enemies.push(enemy);
    }

    // 장애물 생성
    function createObstacles() {
      if (!gameActive || gamePaused) return;

      const settings = difficultySettings[selectedDifficulty];
      const obstacleCount = Math.min(Math.ceil(level / 2), 3);

      for (let i = 0; i < obstacleCount; i++) {
        const height = Math.floor(Math.random() * 150) + 100;
        const gapPosition =
          Math.floor(
            Math.random() * (gameContainer.clientHeight - height - 100)
          ) + 50;
        const offset = i * (gameContainer.clientWidth / (obstacleCount * 2));

        // 상단 장애물
        const topObstacle = document.createElement("div");
        topObstacle.className = "obstacle game-element";
        topObstacle.style.height = `${gapPosition}px`;
        topObstacle.style.top = "0";
        topObstacle.style.right = `-${30 + offset}px`;
        gameContainer.appendChild(topObstacle);

        // 하단 장애물
        const bottomObstacle = document.createElement("div");
        bottomObstacle.className = "obstacle game-element";
        bottomObstacle.style.height = `${
          gameContainer.clientHeight - gapPosition - height
        }px`;
        bottomObstacle.style.bottom = "0";
        bottomObstacle.style.right = `-${30 + offset}px`;
        gameContainer.appendChild(bottomObstacle);

        obstacles.push(topObstacle, bottomObstacle);
      }

      // 점수 증가
      score += pointsMultiplier;
      scoreElement.textContent = score;

      // 레벨 업 체크
      checkLevelUp();

      // 레벨에 따라 적 생성
      if (
        level >= difficultySettings[selectedDifficulty].enemyLevel &&
        Math.random() < 0.3
      ) {
        createEnemy();
      }

      const obstacleDelay = Math.max(
        settings.obstacleFrequency - level * 50,
        600
      );
      obstacleInterval = setTimeout(createObstacles, obstacleDelay);
    }

    // 파워업 생성
    function createPowerup() {
      if (!gameActive || gamePaused) return;

      const settings = difficultySettings[selectedDifficulty];
      const chance = Math.random();

      if (chance < settings.powerupChance) {
        const powerupTypes = ["shield", "slow", "points"];
        const type =
          powerupTypes[Math.floor(Math.random() * powerupTypes.length)];

        const powerup = document.createElement("div");
        powerup.className = `powerup powerup-${type} game-element`;
        powerup.dataset.type = type;

        const powerupY = Math.random() * (gameContainer.clientHeight - 25);
        powerup.style.top = `${powerupY}px`;

        gameContainer.appendChild(powerup);
        powerups.push(powerup);
      }

      const delay = Math.random() * 5000 + 5000;
      powerupInterval = setTimeout(createPowerup, delay);
    }

    // 구름 생성
    function createCloud() {
      const cloud = document.createElement("div");
      cloud.className = "cloud";
      cloud.style.right = "-100px";
      cloud.style.top = `${
        Math.random() * (gameContainer.clientHeight - 50)
      }px`;
      cloud.speed = Math.random() * 2 + 1;

      gameContainer.appendChild(cloud);
      clouds.push(cloud);

      lastCloudTime = Date.now();
    }

    // 요소 이동
    function moveElements() {
      // 장애물 이동
      for (let i = 0; i < obstacles.length; i++) {
        const obstacle = obstacles[i];
        const currentRight = parseInt(obstacle.style.right || "-30");
        const newRight = currentRight + gameSpeed;

        obstacle.style.right = `${newRight}px`;

        if (newRight > gameContainer.clientWidth + 30) {
          obstacle.remove();
          obstacles.splice(i, 1);
          i--;
        }
      }

      // 적 이동
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const currentRight = parseInt(enemy.style.right || "-40");
        const currentTop = parseInt(enemy.style.top || "0");

        enemy.style.right = `${currentRight + enemy.moveSpeed}px`;

        let newTop = currentTop + enemy.verticalDirection * enemy.verticalSpeed;
        if (newTop <= 0 || newTop >= gameContainer.clientHeight - 20) {
          enemy.verticalDirection *= -1;
          newTop = Math.max(
            0,
            Math.min(newTop, gameContainer.clientHeight - 20)
          );
        }
        enemy.style.top = `${newTop}px`;

        if (currentRight + enemy.moveSpeed > gameContainer.clientWidth + 40) {
          enemy.remove();
          enemies.splice(i, 1);
          i--;
        }
      }

      // 파워업 이동
      for (let i = 0; i < powerups.length; i++) {
        const powerup = powerups[i];
        const currentRight = parseInt(powerup.style.right || "-25");
        const newRight = currentRight + gameSpeed;

        powerup.style.right = `${newRight}px`;

        if (newRight > gameContainer.clientWidth + 25) {
          powerup.remove();
          powerups.splice(i, 1);
          i--;
        }
      }

      // 구름 이동
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        const currentRight = parseInt(cloud.style.right || "-100");
        const newRight = currentRight + cloud.speed;

        cloud.style.right = `${newRight}px`;

        if (newRight > gameContainer.clientWidth + 100) {
          cloud.remove();
          clouds.splice(i, 1);
          i--;
        }
      }
    }

    // 요소의 실제 위치 가져오기
    function getElementRect(element) {
      const rect = element.getBoundingClientRect();
      const containerRect = gameContainer.getBoundingClientRect();

      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height
      };
    }

    // 충돌 감지 함수
    function isColliding(rect1, rect2) {
      return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
      );
    }

    // 충돌 검사
    function checkCollisions() {
      // 화면 경계 확인
      if (plane.y < 0 || plane.y > gameContainer.clientHeight - plane.height) {
        gameOver();
        return;
      }

      // 비행기 히트박스 계산
      const planeRect = {
        x: plane.x + plane.hitboxReduction,
        y: plane.y - plane.height / 2 + plane.hitboxReduction,
        width: plane.width - plane.hitboxReduction * 2,
        height: plane.height - plane.hitboxReduction * 2
      };

      // 장애물 충돌 확인
      for (const obstacle of obstacles) {
        const obstacleRect = getElementRect(obstacle);

        if (isColliding(planeRect, obstacleRect)) {
          // 무적 상태가 아니면 게임 오버
          if (!plane.invincible) {
            gameOver();
            return;
          }
        }
      }

      // 적 충돌 확인
      for (const enemy of enemies) {
        const enemyRect = getElementRect(enemy);

        if (isColliding(planeRect, enemyRect)) {
          // 무적 상태가 아니면 게임 오버
          if (!plane.invincible) {
            gameOver();
            return;
          }
        }
      }

      // 파워업 충돌 확인
      for (let i = 0; i < powerups.length; i++) {
        const powerup = powerups[i];
        const powerupRect = getElementRect(powerup);

        if (isColliding(planeRect, powerupRect)) {
          // 파워업 활성화
          activatePowerup(powerup.dataset.type);
          powerup.remove();
          powerups.splice(i, 1);
          i--;
        }
      }
    }

    // 게임 루프
    function gameLoop() {
      if (!gameActive || gamePaused) return;

      // 비행기 위치 업데이트
      planeVelocity += gravity;
      plane.y += planeVelocity;

      // 비행기 회전 효과
      const rotation = Math.min(Math.max(planeVelocity * 2, -30), 30);
      planeElement.style.transform = `translateY(-50%) rotate(${rotation}deg)`;
      planeElement.style.top = `${plane.y}px`;

      // 충돌 및 요소 이동 체크
      checkCollisions();
      moveElements();

      // 구름 생성
      const currentTime = Date.now();
      if (currentTime - lastCloudTime > 2000) {
        createCloud();
        lastCloudTime = currentTime;
      }

      // 다음 프레임 요청
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    // 터치 이벤트 핸들러
    function handleTouch(e) {
      if (e.type === "mousedown" && e.button !== 0) return;
      e.preventDefault();
      planeVelocity = plane.lift;
    }

    function handleTouchEnd(e) {
      if (e.type === "mouseup" && e.button !== 0) return;
      e.preventDefault();
    }

    // 게임 초기화
    function initGame() {
      const settings = difficultySettings[selectedDifficulty];

      // 비행기 위치 초기화
      plane.y = gameContainer.clientHeight / 2;
      planeElement.style.top = `${plane.y}px`;

      // 게임 상태 초기화
      gameActive = true;
      gamePaused = false;
      planeVelocity = 0;
      score = 0;
      level = 1;
      gameSpeed = settings.baseSpeed;
      gravity = settings.gravity;

      // UI 업데이트
      scoreElement.textContent = "0";
      levelElement.textContent = "레벨: 1";

      // 파워업 초기화
      deactivatePowerup();
      pointsMultiplier = 1;

      // 기존 게임 요소 제거
      [obstacles, enemies, powerups, clouds].forEach((arr) => {
        arr.forEach((el) => el.remove());
        arr.length = 0;
      });

      // 터치 이벤트 리스너 설정
      ["touchstart", "mousedown"].forEach((event) =>
        document.addEventListener(event, handleTouch)
      );
      ["touchend", "mouseup"].forEach((event) =>
        document.addEventListener(event, handleTouchEnd)
      );

      // 화면 전환
      screens.intro.style.display = "none";
      buttons.pause.style.display = "block";

      // 게임 시작
      gameLoop();
      createObstacles();
      createPowerup();
    }

    // 게임 오버
    function gameOver() {
      // 게임 상태 비활성화
      gameActive = false;

      // 이벤트 리스너 제거
      ["touchstart", "mousedown", "touchend", "mouseup"].forEach((event) =>
        document.removeEventListener(
          event,
          event.includes("touch") ? handleTouch : handleTouchEnd
        )
      );

      // 애니메이션 및 타이머 중지
      cancelAnimationFrame(animationFrameId);
      clearTimeout(obstacleInterval);
      clearTimeout(powerupInterval);

      // 최고 점수 저장
      saveHighScore();

      // 게임 오버 화면 업데이트
      finalScoreElement.textContent = score;
      screens.gameOver.style.display = "flex";
      buttons.pause.style.display = "none";
    }

    // 초기 설정
    loadHighScore();

    // 버튼 이벤트 리스너
    buttons.start.addEventListener("click", initGame);
    buttons.restart.addEventListener("click", function () {
      // 게임 오버 화면 숨기고 새 게임 시작
      screens.gameOver.style.display = "none";
      initGame();
    });
    buttons.pause.addEventListener("click", togglePause);
    buttons.resume.addEventListener("click", togglePause);
  });
})();
