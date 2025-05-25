// Cole aqui o objeto de configuração do Firebase que você copiou do console
const firebaseConfig = {
    apiKey: "AIzaSyAUEJ-tqQ26B4m7-9CG8C8frevBpZvsvLI",
    authDomain: "futebolpresenca.firebaseapp.com",
    databaseURL: "https://futebolpresenca-default-rtdb.firebaseio.com",
    projectId: "futebolpresenca",
    storageBucket: "futebolpresenca.firebasestorage.app",
    messagingSenderId: "410645587358",
    appId: "1:410645587358:web:5777a493ef77112f16228f",
    measurementId: "G-LJBYMWJM9C"
  };

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// --- Constantes de Configuração da Lista ---
const MAX_FIELD_PLAYERS = 20;
const MAX_GOALKEEPERS = 4;

// --- Constantes do Horário da Lista (Fuso de Brasília) ---
const LIST_OPEN_DAY = 3; // Quarta-feira (Domingo=0, Segunda=1, ..., Sábado=6)
const LIST_OPEN_HOUR = 19; // 19:00
const LIST_OPEN_MINUTE = 0;

const LIST_CLOSE_DAY = 6; // Sábado
const LIST_CLOSE_HOUR = 16; // 16:00
const LIST_CLOSE_MINUTE = 10; // Fecha às 16:11, então aberto até 16:10:59 (minuto < 1)

// --- Referências do DOM ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const listStatusMessageElement = document.getElementById('list-status-message');

const confirmPresenceButton = document.getElementById('confirm-presence-button');
const isGoalkeeperCheckbox = document.getElementById('is-goalkeeper');

const confirmedGoalkeepersListElement = document.getElementById('confirmed-goalkeepers-list');
const confirmedFieldPlayersListElement = document.getElementById('confirmed-fieldplayers-list');
const waitingListElement = document.getElementById('waiting-list');

const confirmedGkCountSpan = document.getElementById('confirmed-gk-count');
const maxGoalkeepersDisplaySpan = document.getElementById('max-goalkeepers-display');
const confirmedFpCountSpan = document.getElementById('confirmed-fp-count');
const maxFieldplayersDisplaySpan = document.getElementById('max-fieldplayers-display');
const waitingCountSpan = document.getElementById('waiting-count');
const errorMessageElement = document.getElementById('error-message');

// Referências para Abas
const tabsContainer = document.querySelector('.tabs-container');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const adminTabButton = document.getElementById('admin-tab-button');

// Referências do Painel Admin
const adminAllUsersListElement = document.getElementById('admin-all-users-list');
const adminSearchUserInput = document.getElementById('admin-search-user');

// --- Estado do Usuário e Admin ---
let currentUser = null;
let isCurrentUserAdmin = false;
let allUsersDataForAdminCache = [];

// --- Lógica de Horário e Fuso Horário de Brasília ---
function getCurrentBrasiliaDateTimeParts() {
    const nowUtc = new Date();
    const brasiliaDateString = nowUtc.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brasiliaEquivalentDate = new Date(brasiliaDateString);

    return {
        dayOfWeek: brasiliaEquivalentDate.getDay(),
        hour: brasiliaEquivalentDate.getHours(),
        minute: brasiliaEquivalentDate.getMinutes(),
        dateObject: brasiliaEquivalentDate
    };
}

function isListCurrentlyOpen() {
    const brasiliaTime = getCurrentBrasiliaDateTimeParts();
    const currentDay = brasiliaTime.dayOfWeek;
    const currentHour = brasiliaTime.hour;
    const currentMinute = brasiliaTime.minute;

    if (currentDay === LIST_OPEN_DAY) {
        return currentHour > LIST_OPEN_HOUR || (currentHour === LIST_OPEN_HOUR && currentMinute >= LIST_OPEN_MINUTE);
    }
    if (currentDay > LIST_OPEN_DAY && currentDay < LIST_CLOSE_DAY) {
        return true;
    }
    if (currentDay === LIST_CLOSE_DAY) {
        return currentHour < LIST_CLOSE_HOUR || (currentHour === LIST_CLOSE_HOUR && currentMinute < LIST_CLOSE_MINUTE);
    }
    return false;
}

function getMostRecentListOpenTimestamp() {
    const nowInBrasiliaView = getCurrentBrasiliaDateTimeParts().dateObject;
    let listOpenDateTimeInBrasiliaView = new Date(nowInBrasiliaView.getTime());
    const dayDifference = (nowInBrasiliaView.getDay() - LIST_OPEN_DAY + 7) % 7;
    listOpenDateTimeInBrasiliaView.setDate(nowInBrasiliaView.getDate() - dayDifference);
    listOpenDateTimeInBrasiliaView.setHours(LIST_OPEN_HOUR, LIST_OPEN_MINUTE, 0, 0);
    
    if (listOpenDateTimeInBrasiliaView.getTime() > nowInBrasiliaView.getTime()) {
        listOpenDateTimeInBrasiliaView.setDate(listOpenDateTimeInBrasiliaView.getDate() - 7);
    }
    return listOpenDateTimeInBrasiliaView.getTime();
}

function updateListAvailabilityUI() {
    const isOpen = isListCurrentlyOpen();
    if (listStatusMessageElement) {
        if (isOpen) {
            listStatusMessageElement.textContent = "Lista de presença ABERTA!";
            listStatusMessageElement.className = 'list-status open';
        } else {
            listStatusMessageElement.textContent = "Lista FECHADA. Abre Quarta 19h, fecha Sábado 16:01.";
            listStatusMessageElement.className = 'list-status closed';
        }
    }

    if (confirmPresenceButton) {
        if (isCurrentUserAdmin) {
            confirmPresenceButton.disabled = false;
        } else {
            confirmPresenceButton.disabled = !isOpen;
        }
    }
}

// --- Lógica de Autenticação ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        userInfo.textContent = `Logado como: ${user.displayName || user.email}`;
        loginButton.style.display = 'none';
        logoutButton.style.display = 'inline-block';
        if (tabsContainer) tabsContainer.style.display = 'block';

        const userLoginRef = database.ref(`allUsersLogins/${user.uid}`);
        userLoginRef.set({
            name: user.displayName || "Usuário Anônimo",
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        }).catch(error => console.error("Erro ao salvar login:", error));

        const adminStatusRef = database.ref(`admins/${user.uid}`);
        adminStatusRef.once('value').then(snapshot => {
            isCurrentUserAdmin = snapshot.exists() && snapshot.val() === true;
            console.log("Status de Admin:", isCurrentUserAdmin);

            if (adminTabButton) {
                adminTabButton.style.display = isCurrentUserAdmin ? 'inline-block' : 'none';
            }

            if (isCurrentUserAdmin) {
                loadAndRenderAllUsersListForAdmin();
                checkAndPerformAdminAutoAdd();
            } else {
                const adminPanelTab = document.getElementById('tab-admin-panel');
                if (adminPanelTab && adminPanelTab.classList.contains('active')) {
                    const gameListsTabButton = document.querySelector('.tab-button[data-tab="tab-game-lists"]');
                    if (gameListsTabButton) gameListsTabButton.click();
                }
                if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '';
                allUsersDataForAdminCache = [];
            }
            loadLists();
            updateListAvailabilityUI();
        }).catch(error => {
            console.error("Erro ao verificar admin:", error);
            isCurrentUserAdmin = false;
            if (adminTabButton) adminTabButton.style.display = 'none';
            loadLists();
            updateListAvailabilityUI();
        });
    } else {
        isCurrentUserAdmin = false;
        currentUser = null;
        userInfo.textContent = 'Por favor, faça login para participar.';
        loginButton.style.display = 'inline-block';
        logoutButton.style.display = 'none';
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (adminTabButton) adminTabButton.style.display = 'none';
        if (listStatusMessageElement) listStatusMessageElement.textContent = '';
        if (confirmPresenceButton) confirmPresenceButton.disabled = true;

        clearListsUI();
        if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '';
        allUsersDataForAdminCache = [];
    }
});

loginButton.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Erro no login:", error);
        displayErrorMessage("Falha no login. Tente novamente.");
    });
});

logoutButton.addEventListener('click', () => {
    auth.signOut().catch(error => {
        console.error("Erro no logout:", error);
        displayErrorMessage("Falha ao deslogar.");
    });
});

// --- Lógica das Abas ---
if (tabButtons && tabContents) {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const targetTabId = button.getAttribute('data-tab');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            if (targetTabId === 'tab-admin-panel' && isCurrentUserAdmin && adminSearchUserInput) {
                filterAndRenderAdminUserList(adminSearchUserInput.value);
            }
        });
    });
}

// --- Adição Automática de Admins ---
async function checkAndPerformAdminAutoAdd() {
    if (!isCurrentUserAdmin || !isListCurrentlyOpen()) {
        return;
    }
    const currentCycleTimestamp = getMostRecentListOpenTimestamp();
    const scheduleStateRef = database.ref('scheduleState/lastAdminAutoAddCycleTimestamp');

    try {
        const snapshot = await scheduleStateRef.once('value');
        const lastCycleTimestamp = snapshot.val() || 0;

        if (currentCycleTimestamp > lastCycleTimestamp) {
            console.log("Novo ciclo, adicionando admins...");
            displayErrorMessage("Adicionando administradores à lista...");

            const adminsSnapshot = await database.ref('admins').once('value');
            const adminUidsMap = adminsSnapshot.val();
            if (!adminUidsMap) {
                console.log("Nenhum admin configurado.");
                await scheduleStateRef.set(currentCycleTimestamp);
                return;
            }
            const adminUids = Object.keys(adminUidsMap);
            
            const [confirmedSnapshot, allLoginsSnapshot] = await Promise.all([
                confirmedPlayersRef.once('value'),
                database.ref('allUsersLogins').once('value')
            ]);
            
            let confirmedPlayers = confirmedSnapshot.val() || {}; // Usar let para poder reatribuir localmente
            const allLogins = allLoginsSnapshot.val() || {};

            let localConfirmedPlayersArray = Object.values(confirmedPlayers);
            let numConfirmedFieldPlayers = localConfirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

            let adminsAddedCount = 0;
            for (const adminUid of adminUids) {
                if (!confirmedPlayers[adminUid]) {
                    const adminName = allLogins[adminUid]?.name || `Admin ${adminUid.substring(0, 6)}`;
                    const adminData = {
                        name: adminName,
                        isGoalkeeper: false,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };

                    if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                        await confirmedPlayersRef.child(adminUid).set(adminData);
                        console.log(`Admin ${adminName} adicionado automaticamente.`);
                        adminsAddedCount++;
                        // Atualiza o objeto local para a próxima iteração e contagem
                        confirmedPlayers[adminUid] = adminData; 
                        numConfirmedFieldPlayers++;
                    } else {
                        console.log(`Admin ${adminName} não pôde ser adicionado (limite de linha).`);
                    }
                } else {
                    console.log(`Admin ${allLogins[adminUid]?.name || adminUid.substring(0,6)} já está na lista.`);
                }
            }
            if (adminsAddedCount > 0) displayErrorMessage(`${adminsAddedCount} administrador(es) adicionado(s).`);
            await scheduleStateRef.set(currentCycleTimestamp);
        } else {
            console.log("Adição de admins para este ciclo já feita ou não é o momento.");
        }
    } catch (error) {
        console.error("Erro na adição automática de admins:", error);
        displayErrorMessage("Erro ao adicionar admins automaticamente.");
    }
}

// --- Lógica da Lista de Presença (Firebase Refs e Funções) ---
const confirmedPlayersRef = database.ref('listaFutebol/jogadoresConfirmados');
const waitingListRef = database.ref('listaFutebol/listaEspera');

if (maxGoalkeepersDisplaySpan) maxGoalkeepersDisplaySpan.textContent = MAX_GOALKEEPERS;
if (maxFieldplayersDisplaySpan) maxFieldplayersDisplaySpan.textContent = MAX_FIELD_PLAYERS;

function displayErrorMessage(message) {
    if (errorMessageElement) {
        errorMessageElement.textContent = message;
        errorMessageElement.style.display = 'block';
        setTimeout(() => {
            if (errorMessageElement) {
                errorMessageElement.textContent = '';
                errorMessageElement.style.display = 'none';
            }
        }, 5000);
    }
}

confirmPresenceButton.addEventListener('click', async () => {
    if (!currentUser) {
        displayErrorMessage("Você precisa estar logado para confirmar presença.");
        return;
    }
     if (!isCurrentUserAdmin && !isListCurrentlyOpen()) {
        displayErrorMessage("A lista de presença não está aberta no momento.");
        return;
    }

    const isGoalkeeper = isGoalkeeperCheckbox.checked;
    const playerId = currentUser.uid;
    const playerName = currentUser.displayName || "Jogador Anônimo";

    try {
        const confirmedSnapshot = await confirmedPlayersRef.once('value');
        const confirmedPlayers = confirmedSnapshot.val() || {};
        const waitingSnapshot = await waitingListRef.once('value');
        const waitingPlayers = waitingSnapshot.val() || {};

        if (confirmedPlayers[playerId] || waitingPlayers[playerId]) {
            displayErrorMessage("Você já está na lista ou na espera.");
            return;
        }

        const confirmedPlayersArray = Object.values(confirmedPlayers);
        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const playerData = {
            name: playerName,
            isGoalkeeper: isGoalkeeper,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        if (isGoalkeeper) {
            if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                await confirmedPlayersRef.child(playerId).set(playerData);
                displayErrorMessage("Presença como goleiro confirmada!");
            } else {
                await addToWaitingList(playerId, playerName, true, playerData);
                displayErrorMessage("Limite de goleiros atingido. Adicionado à lista de espera.");
            }
        } else {
            if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                await confirmedPlayersRef.child(playerId).set(playerData);
                displayErrorMessage("Presença como jogador de linha confirmada!");
            } else {
                await addToWaitingList(playerId, playerName, false, playerData);
                displayErrorMessage("Limite de jogadores de linha atingido. Adicionado à lista de espera.");
            }
        }
    } catch (error) {
        console.error("Erro ao confirmar presença:", error);
        displayErrorMessage("Ocorreu um erro ao confirmar sua presença.");
    }
});

async function addToWaitingList(playerId, playerName, isGoalkeeper, dataToSet = null) {
    try {
        const waitingData = dataToSet ? dataToSet : {
            name: playerName,
            isGoalkeeper: isGoalkeeper,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        await waitingListRef.child(playerId).set(waitingData);
    } catch (error) {
        console.error("Erro ao adicionar à lista de espera:", error);
        displayErrorMessage("Erro ao entrar na lista de espera.");
    }
}

async function removePlayer(playerId, listType) {
    if (!currentUser) {
        displayErrorMessage("Você precisa estar logado para esta ação.");
        return;
    }
    try {
        if (listType === 'confirmed') {
            await confirmedPlayersRef.child(playerId).remove();
            displayErrorMessage("Jogador removido da lista principal.");
            await checkWaitingListAndPromote();
        } else if (listType === 'waiting') {
            await waitingListRef.child(playerId).remove();
            displayErrorMessage("Jogador removido da lista de espera.");
        }
    } catch (error) {
        console.error(`Erro ao remover jogador da lista ${listType}:`, error);
        displayErrorMessage("Erro ao remover da lista.");
    }
}

async function checkWaitingListAndPromote() {
    try {
        const confirmedSnapshot = await confirmedPlayersRef.once('value');
        const confirmedPlayersData = confirmedSnapshot.val() || {};
        const confirmedPlayersArray = Object.values(confirmedPlayersData);

        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const waitingSnapshot = await waitingListRef.orderByChild('timestamp').once('value');
        const waitingPlayersData = waitingSnapshot.val();

        if (!waitingPlayersData) return;

        const waitingPlayersArray = Object.entries(waitingPlayersData)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => a.timestamp - b.timestamp);

        for (const playerToPromote of waitingPlayersArray) {
            let promoted = false;
            if (playerToPromote.isGoalkeeper) {
                if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Goleiro ${playerToPromote.name} promovido.`);
                    promoted = true;
                }
            } else {
                if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Jogador de linha ${playerToPromote.name} promovido.`);
                    promoted = true;
                }
            }
            if (promoted) {
                break; 
            }
        }
    } catch (error) {
        console.error("Erro ao promover jogador:", error);
        displayErrorMessage("Erro ao tentar promover jogador da espera.");
    }
}

// --- Funções de Renderização da UI (Listas de Jogo) ---
function renderPlayerListItem(player, index, listTypeIdentifier) {
    const li = document.createElement('li');

    const playerTextInfo = document.createElement('div');
    playerTextInfo.classList.add('player-text-info');

    const orderSpan = document.createElement('span');
    orderSpan.classList.add('player-order');
    orderSpan.textContent = `${index + 1}. `;
    playerTextInfo.appendChild(orderSpan);

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('player-name');
    nameSpan.textContent = player.name;
    playerTextInfo.appendChild(nameSpan);

    if (player.isGoalkeeper) {
        const gkIndicator = document.createElement('span');
        gkIndicator.classList.add('player-info');
        gkIndicator.textContent = ' (Goleiro)';
        if (listTypeIdentifier === 'confirmed-fp' || listTypeIdentifier === 'waiting') {
             playerTextInfo.appendChild(gkIndicator);
        }
    }
    li.appendChild(playerTextInfo);

    if (currentUser && (currentUser.uid === player.id || isCurrentUserAdmin)) {
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-button');
        removeBtn.textContent = (isCurrentUserAdmin && currentUser.uid !== player.id) ? 'Remover' : 'Sair';
        if (isCurrentUserAdmin && currentUser.uid !== player.id) {
            removeBtn.style.backgroundColor = '#f39c12';
        } else if (isCurrentUserAdmin && currentUser.uid === player.id){
             // removeBtn.textContent = 'Sair (Admin)'; // Opcional
        }
        const listTypeForRemove = listTypeIdentifier.startsWith('confirmed') ? 'confirmed' : 'waiting';
        removeBtn.onclick = () => removePlayer(player.id, listTypeForRemove);
        li.appendChild(removeBtn);
    }
    return li;
}

function renderConfirmedLists(confirmedPlayersObject) {
    if(confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.innerHTML = '';
    if(confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.innerHTML = '';

    if (!confirmedPlayersObject) {
        if(confirmedGkCountSpan) confirmedGkCountSpan.textContent = 0;
        if(confirmedFpCountSpan) confirmedFpCountSpan.textContent = 0;
        return;
    }

    const allConfirmedArray = Object.entries(confirmedPlayersObject)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp);

    const goalkeepers = [];
    const fieldPlayers = [];

    allConfirmedArray.forEach(player => {
        if (player.isGoalkeeper) {
            goalkeepers.push(player);
        } else {
            fieldPlayers.push(player);
        }
    });

    goalkeepers.forEach((player, index) => {
        if(confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-gk'));
    });
    if(confirmedGkCountSpan) confirmedGkCountSpan.textContent = goalkeepers.length;

    fieldPlayers.forEach((player, index) => {
        if(confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-fp'));
    });
    if(confirmedFpCountSpan) confirmedFpCountSpan.textContent = fieldPlayers.length;
}

function renderWaitingList(waitingPlayersObject) {
    if(waitingListElement) waitingListElement.innerHTML = '';
    if (!waitingPlayersObject) {
        if(waitingCountSpan) waitingCountSpan.textContent = 0;
        return;
    }

    const waitingArray = Object.entries(waitingPlayersObject)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp);

    waitingArray.forEach((player, index) => {
        if(waitingListElement) waitingListElement.appendChild(renderPlayerListItem(player, index, 'waiting'));
    });
    if(waitingCountSpan) waitingCountSpan.textContent = waitingArray.length;
}

function clearListsUI() {
    if(confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.innerHTML = '';
    if(confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.innerHTML = '';
    if(waitingListElement) waitingListElement.innerHTML = '';
    if(confirmedGkCountSpan) confirmedGkCountSpan.textContent = '0';
    if(confirmedFpCountSpan) confirmedFpCountSpan.textContent = '0';
    if(waitingCountSpan) waitingCountSpan.textContent = '0';
    if(listStatusMessageElement) listStatusMessageElement.textContent = ''; // Limpa mensagem de status também
}

// --- Funções para o Painel do Admin ---
function renderAdminUserListItemForPanel(user, isConfirmed, isInWaitingList) {
    const li = document.createElement('li');
    li.classList.add('admin-user-item');

    const userInfoDiv = document.createElement('div');
    userInfoDiv.classList.add('admin-user-info');
    userInfoDiv.innerHTML = `<strong>${user.name}</strong> <small>(UID: ${user.id})</small>`;

    if (isConfirmed) {
        const badge = document.createElement('span');
        badge.className = 'status-badge confirmed-badge';
        badge.textContent = 'Confirmado';
        userInfoDiv.appendChild(badge);
    } else if (isInWaitingList) {
        const badge = document.createElement('span');
        badge.className = 'status-badge waiting-badge';
        badge.textContent = 'Na Espera';
        userInfoDiv.appendChild(badge);
    }
    li.appendChild(userInfoDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('admin-user-item-actions');

    if (!isConfirmed && !isInWaitingList) {
        const gkLabel = document.createElement('label');
        gkLabel.textContent = 'Goleiro? ';
        gkLabel.style.marginRight = '5px';
        gkLabel.style.fontSize = '0.9em';

        const isGoalkeeperCheckboxForAdmin = document.createElement('input');
        isGoalkeeperCheckboxForAdmin.type = 'checkbox';
        isGoalkeeperCheckboxForAdmin.id = `admin-add-gk-${user.id}`;
        isGoalkeeperCheckboxForAdmin.classList.add('admin-add-gk-checkbox');
        isGoalkeeperCheckboxForAdmin.style.verticalAlign = 'middle';
        
        gkLabel.htmlFor = isGoalkeeperCheckboxForAdmin.id;

        const addButton = document.createElement('button');
        addButton.textContent = 'Adicionar ao Jogo';
        addButton.classList.add('admin-add-button');
        addButton.onclick = () => adminAddPlayerToGame(user.id, user.name, isGoalkeeperCheckboxForAdmin.checked);

        actionsDiv.appendChild(gkLabel);
        actionsDiv.appendChild(isGoalkeeperCheckboxForAdmin);
        actionsDiv.appendChild(addButton);
    } else {
        const statusMsg = document.createElement('span');
        statusMsg.textContent = isConfirmed ? 'Já está Confirmado.' : 'Já está na Espera.';
        statusMsg.style.fontSize = '0.9em';
        statusMsg.style.fontStyle = 'italic';
        actionsDiv.appendChild(statusMsg);
    }
    li.appendChild(actionsDiv);
    return li;
}

async function adminAddPlayerToGame(playerId, playerName, isPlayerGoalkeeper) {
    if (!isCurrentUserAdmin) {
        displayErrorMessage("Ação restrita a administradores.");
        return;
    }
    displayErrorMessage(`Adicionando ${playerName}...`);

    try {
        const confirmedSnapshot = await confirmedPlayersRef.once('value');
        const confirmedData = confirmedSnapshot.val() || {};
        const waitingSnapshot = await waitingListRef.once('value');
        const waitingData = waitingSnapshot.val() || {};

        if (confirmedData[playerId] || waitingData[playerId]) {
            displayErrorMessage(`${playerName} já está em uma das listas.`);
            // Força atualização da lista de admin para garantir que o badge esteja correto.
            if (isCurrentUserAdmin && document.getElementById('tab-admin-panel')?.classList.contains('active')) {
                filterAndRenderAdminUserList(adminSearchUserInput ? adminSearchUserInput.value : "");
            }
            return;
        }

        const playerData = {
            name: playerName,
            isGoalkeeper: isPlayerGoalkeeper,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        const confirmedArray = Object.values(confirmedData);
        const numGkConfirmed = confirmedArray.filter(p => p.isGoalkeeper).length;
        const numFpConfirmed = confirmedArray.filter(p => !p.isGoalkeeper).length;

        if (isPlayerGoalkeeper) {
            if (numGkConfirmed < MAX_GOALKEEPERS) {
                await confirmedPlayersRef.child(playerId).set(playerData);
                displayErrorMessage(`${playerName} (G) adicionado aos Confirmados.`);
            } else {
                await waitingListRef.child(playerId).set(playerData);
                displayErrorMessage(`Limite de Goleiros atingido. ${playerName} (G) adicionado à Espera.`);
            }
        } else {
            if (numFpConfirmed < MAX_FIELD_PLAYERS) {
                await confirmedPlayersRef.child(playerId).set(playerData);
                displayErrorMessage(`${playerName} adicionado aos Confirmados.`);
            } else {
                await waitingListRef.child(playerId).set(playerData);
                displayErrorMessage(`Limite de Jogadores de Linha atingido. ${playerName} adicionado à Espera.`);
            }
        }
        // A atualização da lista de admin para refletir o novo status (badge)
        // agora é primariamente tratada pelos listeners em `loadLists`.
        // Uma chamada explícita aqui é redundante se os listeners funcionarem bem.

    } catch (error) {
        console.error("Erro do Admin ao adicionar jogador:", error);
        displayErrorMessage("Falha ao adicionar jogador. Verifique o console.");
    }
}

function filterAndRenderAdminUserList(searchTerm = "") {
    if (!adminAllUsersListElement || !isCurrentUserAdmin) return;
    adminAllUsersListElement.innerHTML = '';

    const lowerSearchTerm = searchTerm.toLowerCase();
    const filteredUsers = allUsersDataForAdminCache.filter(user =>
        user.name.toLowerCase().includes(lowerSearchTerm) || user.id.toLowerCase().includes(lowerSearchTerm)
    );
    
    Promise.all([
        confirmedPlayersRef.once('value'),
        waitingListRef.once('value')
    ]).then(([confirmedSnapshot, waitingSnapshot]) => {
        const confirmedPlayers = confirmedSnapshot.val() || {};
        const waitingPlayers = waitingSnapshot.val() || {};

        if (filteredUsers.length > 0) {
            filteredUsers.forEach(user => {
                const isConfirmed = !!confirmedPlayers[user.id];
                const isInWaitingList = !!waitingPlayers[user.id];
                adminAllUsersListElement.appendChild(renderAdminUserListItemForPanel(user, isConfirmed, isInWaitingList));
            });
        } else {
            adminAllUsersListElement.innerHTML = `<li>Nenhum usuário encontrado ${searchTerm ? 'com o termo "' + searchTerm + '"' : 'ou nenhum login registrado'}.</li>`;
        }
    }).catch(error => {
        console.error("Erro ao buscar status dos jogadores (admin panel):", error);
        adminAllUsersListElement.innerHTML = '<li>Erro ao carregar status dos jogadores.</li>';
    });
}

function loadAndRenderAllUsersListForAdmin() {
    if (!isCurrentUserAdmin || !adminAllUsersListElement) {
        if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '';
        allUsersDataForAdminCache = [];
        return;
    }

    const allUsersLoginsRef = database.ref('allUsersLogins');
    allUsersLoginsRef.orderByChild('lastLogin').on('value', snapshot => {
        const usersData = snapshot.val();
        if (usersData) {
            allUsersDataForAdminCache = Object.entries(usersData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => b.lastLogin - a.lastLogin);
            
            const adminPanelTab = document.getElementById('tab-admin-panel');
            if(adminPanelTab && adminPanelTab.classList.contains('active') && adminSearchUserInput) {
                filterAndRenderAdminUserList(adminSearchUserInput.value);
            } else if (adminPanelTab && adminPanelTab.classList.contains('active')) {
                filterAndRenderAdminUserList(""); // Renderiza sem filtro se o campo de busca não existir
            }
        } else {
            allUsersDataForAdminCache = [];
            if(adminAllUsersListElement) adminAllUsersListElement.innerHTML = '<li>Nenhum login de usuário registrado ainda.</li>';
        }
    }, error => {
        console.error("Erro ao carregar lista de usuários para admin:", error);
        if(adminAllUsersListElement) adminAllUsersListElement.innerHTML = '<li>Erro ao carregar lista de usuários.</li>';
        allUsersDataForAdminCache = [];
    });
}

// --- Listeners do Firebase para Atualizações em Tempo Real (Listas de Jogo) ---
function loadLists() {
    updateListAvailabilityUI(); // Chamada aqui para garantir que o status seja atualizado ao carregar

    if (confirmedPlayersRef) {
        confirmedPlayersRef.on('value', snapshot => {
            const players = snapshot.val();
            renderConfirmedLists(players);
            const adminPanelTab = document.getElementById('tab-admin-panel');
            if (isCurrentUserAdmin && adminPanelTab && adminPanelTab.classList.contains('active') && adminSearchUserInput) {
                filterAndRenderAdminUserList(adminSearchUserInput.value);
            }
        }, error => {
            console.error("Erro ao carregar lista de confirmados:", error);
            displayErrorMessage("Não foi possível carregar a lista de confirmados.");
        });
    }

    if (waitingListRef) {
        waitingListRef.on('value', snapshot => {
            const players = snapshot.val();
            renderWaitingList(players);
            checkWaitingListAndPromote();
            const adminPanelTab = document.getElementById('tab-admin-panel');
            if (isCurrentUserAdmin && adminPanelTab && adminPanelTab.classList.contains('active') && adminSearchUserInput) {
                filterAndRenderAdminUserList(adminSearchUserInput.value);
            }
        }, error => {
            console.error("Erro ao carregar lista de espera:", error);
            displayErrorMessage("Não foi possível carregar a lista de espera.");
        });
    }
}

// Adiciona listener para o campo de busca de admin
if (adminSearchUserInput) {
    adminSearchUserInput.addEventListener('input', (e) => {
        if (isCurrentUserAdmin) {
            filterAndRenderAdminUserList(e.target.value);
        }
    });
}