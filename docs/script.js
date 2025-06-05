// Configuração do Firebase (usando os valores que você forneceu)
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

// --- Configurações do Horário da Lista (valores padrão, serão sobrescritos pelo Firebase) ---
let currentScheduleConfig = {
    openDay: 3,    // Quarta-feira (Domingo=0)
    openHour: 19,  // 19:00
    openMinute: 0,
    closeDay: 6,   // Sábado
    closeHour: 16, // 16:00
    closeMinute: 1 // Lista fecha às 16:01 (aberto até 16:00:59)
};
let scheduleConfigLoaded = false;

// --- Referências do DOM ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const listStatusMessageElement = document.getElementById('list-status-message');

const confirmPresenceButton = document.getElementById('confirm-presence-button');
const isGoalkeeperCheckbox = document.getElementById('is-goalkeeper');
const needsToleranceCheckbox = document.getElementById('needs-tolerance');

const confirmedGoalkeepersListElement = document.getElementById('confirmed-goalkeepers-list');
const confirmedFieldPlayersListElement = document.getElementById('confirmed-fieldplayers-list');
const waitingListElement = document.getElementById('waiting-list');

const guestNameInput = document.getElementById('guest-name');
const guestIsGoalkeeperCheckbox = document.getElementById('guest-is-goalkeeper');
const addGuestButton = document.getElementById('add-guest-button');
const guestAddStatusElement = document.getElementById('guest-add-status');
const guestFridayMessageElement = document.getElementById('guest-friday-message');


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

const adminOpenDaySelect = document.getElementById('admin-open-day');
const adminOpenHourInput = document.getElementById('admin-open-hour');
const adminOpenMinuteInput = document.getElementById('admin-open-minute');
const adminCloseDaySelect = document.getElementById('admin-close-day');
const adminCloseHourInput = document.getElementById('admin-close-hour');
const adminCloseMinuteInput = document.getElementById('admin-close-minute');
const saveScheduleButton = document.getElementById('save-schedule-button');
const scheduleSaveStatusElement = document.getElementById('schedule-save-status');

// --- Estado do Usuário e Admin ---
let currentUser = null;
let isCurrentUserAdmin = false;
let allUsersDataForAdminCache = [];
let listStatusUpdateInterval = null;
const LIST_STATUS_UPDATE_INTERVAL_MS = 20 * 1000;

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
    if (!scheduleConfigLoaded) {
        console.warn("Configurações de horário ainda não carregadas, assumindo lista fechada para checagem.");
        return false;
    }
    const brasiliaTime = getCurrentBrasiliaDateTimeParts();
    const currentDay = brasiliaTime.dayOfWeek;
    const currentHour = brasiliaTime.hour;
    const currentMinute = brasiliaTime.minute;

    if (currentDay === currentScheduleConfig.openDay) {
        return currentHour > currentScheduleConfig.openHour || (currentHour === currentScheduleConfig.openHour && currentMinute >= currentScheduleConfig.openMinute);
    }
    if (currentDay > currentScheduleConfig.openDay && currentDay < currentScheduleConfig.closeDay) {
        return true;
    }
    if (currentDay === currentScheduleConfig.closeDay) {
        return currentHour < currentScheduleConfig.closeHour || (currentHour === currentScheduleConfig.closeHour && currentMinute < currentScheduleConfig.closeMinute);
    }
    return false;
}

function getMostRecentListOpenTimestamp() {
    if (!scheduleConfigLoaded) {
        console.warn("getMostRecentListOpenTimestamp chamada antes das configs do Firebase serem totalmente carregadas. Usando defaults se disponíveis.");
        const tempDefaultSchedule = { openDay: 3, openHour: 19, openMinute: 0 };
        const tempNow = getCurrentBrasiliaDateTimeParts().dateObject;
        let tempOpenDate = new Date(tempNow.getTime());
        const tempDayDiff = (tempNow.getDay() - tempDefaultSchedule.openDay + 7) % 7;
        tempOpenDate.setDate(tempNow.getDate() - tempDayDiff);
        tempOpenDate.setHours(tempDefaultSchedule.openHour, tempDefaultSchedule.openMinute, 0, 0);
        if (tempOpenDate.getTime() > tempNow.getTime()) tempOpenDate.setDate(tempOpenDate.getDate() - 7);
        return tempOpenDate.getTime();
    }
    const nowInBrasiliaView = getCurrentBrasiliaDateTimeParts().dateObject;
    let listOpenDateTimeInBrasiliaView = new Date(nowInBrasiliaView.getTime());

    const dayDifference = (nowInBrasiliaView.getDay() - currentScheduleConfig.openDay + 7) % 7;
    listOpenDateTimeInBrasiliaView.setDate(nowInBrasiliaView.getDate() - dayDifference);
    listOpenDateTimeInBrasiliaView.setHours(currentScheduleConfig.openHour, currentScheduleConfig.openMinute, 0, 0);

    if (listOpenDateTimeInBrasiliaView.getTime() > nowInBrasiliaView.getTime()) {
        listOpenDateTimeInBrasiliaView.setDate(listOpenDateTimeInBrasiliaView.getDate() - 7);
    }
    return listOpenDateTimeInBrasiliaView.getTime();
}

function updateListAvailabilityUI() {
    if (!scheduleConfigLoaded && currentUser) {
        if (listStatusMessageElement) {
            listStatusMessageElement.textContent = "Verificando horário da lista...";
            listStatusMessageElement.className = 'list-status neutral';
        }
        if (confirmPresenceButton) confirmPresenceButton.disabled = true;
        return;
    }
    if (!scheduleConfigLoaded && !currentUser) {
        if (listStatusMessageElement) listStatusMessageElement.textContent = "Faça login para ver o status da lista.";
        if (confirmPresenceButton) confirmPresenceButton.disabled = true;
        return;
    }

    const isOpen = isListCurrentlyOpen();
    if (listStatusMessageElement) {
        if (isOpen) {
            listStatusMessageElement.textContent = "Lista de presença ABERTA!";
            listStatusMessageElement.className = 'list-status open';
        } else {
            const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
            const openTimeStr = `${dias[currentScheduleConfig.openDay]} às ${String(currentScheduleConfig.openHour).padStart(2, '0')}:${String(currentScheduleConfig.openMinute).padStart(2, '0')}`;
            let closeMinuteDisplay = String(currentScheduleConfig.closeMinute).padStart(2, '0');
            if (parseInt(currentScheduleConfig.closeMinute, 10) === 1 && parseInt(currentScheduleConfig.closeHour, 10) === 16) {
                closeMinuteDisplay = "01";
            }
            const closeTimeStr = `${dias[currentScheduleConfig.closeDay]} às ${String(currentScheduleConfig.closeHour).padStart(2, '0')}:${closeMinuteDisplay}`;
            listStatusMessageElement.textContent = `Lista FECHADA. Abre ${openTimeStr}, fecha ${closeTimeStr}.`;
            listStatusMessageElement.className = 'list-status closed';
        }
    }
    if (confirmPresenceButton) {
        if (currentUser) {
            confirmPresenceButton.disabled = isCurrentUserAdmin ? false : !isOpen;
        } else {
            confirmPresenceButton.disabled = true;
        }
    }
}

function isItFridayInBrasilia() {
    const brasiliaTime = getCurrentBrasiliaDateTimeParts();
    return brasiliaTime.dayOfWeek === 5; // Sexta-feira é 5 (Dom=0)
}

function updateGuestAdditionAvailabilityUI() {
    const guestNameInputElem = guestNameInput;
    const guestIsGoalkeeperCheckboxElem = guestIsGoalkeeperCheckbox;
    const addGuestButtonElem = addGuestButton;
    const guestFridayMessageElem = document.getElementById('guest-friday-message');
    const guestNameLabel = document.querySelector('.guest-controls .form-group label[for="guest-name"]');
    const guestIsGkGroup = document.querySelector('.guest-controls .controls .form-group-inline');


    if (!guestNameInputElem || !guestIsGoalkeeperCheckboxElem || !addGuestButtonElem || !guestFridayMessageElem || !guestNameLabel || !guestIsGkGroup) {
        console.warn("Elementos da UI de convidado não encontrados para updateGuestAdditionAvailabilityUI.");
        return;
    }

    const canAddGuestsToday = isItFridayInBrasilia();

    if (isCurrentUserAdmin) {
        guestNameInputElem.disabled = false;
        guestIsGoalkeeperCheckboxElem.disabled = false;
        addGuestButtonElem.disabled = false;
        guestFridayMessageElem.style.display = 'none';
        guestNameLabel.style.display = 'block';
        guestIsGkGroup.style.display = 'flex';
        guestNameInputElem.style.display = 'block';
        addGuestButtonElem.style.display = 'inline-flex';
    } else if (canAddGuestsToday) {
        guestNameInputElem.disabled = false;
        guestIsGoalkeeperCheckboxElem.disabled = false;
        addGuestButtonElem.disabled = false;
        guestFridayMessageElem.style.display = 'none';
        guestNameLabel.style.display = 'block';
        guestIsGkGroup.style.display = 'flex';
        guestNameInputElem.style.display = 'block';
        addGuestButtonElem.style.display = 'inline-flex';
    } else {
        guestNameInputElem.disabled = true;
        guestIsGoalkeeperCheckboxElem.disabled = true;
        addGuestButtonElem.disabled = true;
        guestFridayMessageElem.textContent = "Adição de convidados permitida apenas às sextas-feiras.";
        guestFridayMessageElem.style.display = 'block';
    }
}

// --- Carregar Configurações de Horário do Firebase ---
function fetchScheduleSettings() {
    const scheduleSettingsRef = database.ref('scheduleSettings');
    scheduleSettingsRef.on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings && typeof settings.openDay === 'number' && typeof settings.openHour === 'number') {
            currentScheduleConfig = settings;
            console.log("Configurações de horário carregadas/atualizadas:", currentScheduleConfig);
        } else {
            console.warn("Config. de horário não encontradas ou inválidas. Usando padrões.");
        }
        scheduleConfigLoaded = true;

        updateListAvailabilityUI();
        updateGuestAdditionAvailabilityUI();
        if (currentUser && isCurrentUserAdmin) {
            populateScheduleForm(currentScheduleConfig);
            checkAndPerformAdminAutoAdd();
        } else if (currentUser) {
            // Nada específico para não-admin aqui além do que já foi feito
        }

        if (listStatusUpdateInterval) clearInterval(listStatusUpdateInterval);
        listStatusUpdateInterval = setInterval(() => {
            updateListAvailabilityUI();
            updateGuestAdditionAvailabilityUI();
        }, LIST_STATUS_UPDATE_INTERVAL_MS);

    }, (error) => {
        console.error("Erro ao buscar config. de horário:", error);
        scheduleConfigLoaded = true;
        updateListAvailabilityUI();
        updateGuestAdditionAvailabilityUI();
        if (currentUser && isCurrentUserAdmin) {
            populateScheduleForm(currentScheduleConfig);
        }
        if (listStatusUpdateInterval) clearInterval(listStatusUpdateInterval);
        listStatusUpdateInterval = setInterval(() => {
            updateListAvailabilityUI();
            updateGuestAdditionAvailabilityUI();
        }, LIST_STATUS_UPDATE_INTERVAL_MS);
    });
}

// --- Lógica de Autenticação ---
auth.onAuthStateChanged(async user => {
    if (user) {
        let userObjectToUse = user;
        try {
            console.log("onAuthStateChanged - Tentando user.reload() para perfil atualizado...");
            await userObjectToUse.reload();
            userObjectToUse = auth.currentUser;
            console.log("user.reload() bem-sucedido. displayName atual (antes de providerData):", userObjectToUse.displayName);
        } catch (error) {
            console.error("Erro durante user.reload():", error);
        }

        let finalDisplayName = userObjectToUse.displayName;
        let finalPhotoURL = userObjectToUse.photoURL;
        const providerData = userObjectToUse.providerData;

        if (providerData && providerData.length > 0) {
            const googleInfo = providerData.find(p => p.providerId === 'google.com');
            if (googleInfo) {
                let profileNeedsUpdate = false;
                if (googleInfo.displayName && googleInfo.displayName !== finalDisplayName) {
                    console.log(`DisplayName divergente. Top-level: "${finalDisplayName}", ProviderData: "${googleInfo.displayName}".`);
                    finalDisplayName = googleInfo.displayName;
                    profileNeedsUpdate = true;
                } else if (googleInfo.displayName) { // Se for igual ou se finalDisplayName era null
                    finalDisplayName = googleInfo.displayName || finalDisplayName;
                }

                if (googleInfo.photoURL && googleInfo.photoURL !== finalPhotoURL) {
                    console.log(`PhotoURL divergente.`);
                    finalPhotoURL = googleInfo.photoURL;
                    profileNeedsUpdate = true;
                } else if (googleInfo.photoURL) { // Se for igual ou se finalPhotoURL era null
                    finalPhotoURL = googleInfo.photoURL || finalPhotoURL;
                }

                if (profileNeedsUpdate) {
                    try {
                        await userObjectToUse.updateProfile({ displayName: finalDisplayName, photoURL: finalPhotoURL });
                        userObjectToUse = auth.currentUser;
                        finalDisplayName = userObjectToUse.displayName;
                        finalPhotoURL = userObjectToUse.photoURL;
                        console.log("Perfil do Firebase atualizado. Novo displayName:", finalDisplayName, "Nova photoURL:", finalPhotoURL);
                    } catch (updateError) {
                        console.error("Erro ao atualizar o perfil do Firebase:", updateError);
                    }
                } else {
                    console.log("DisplayName e PhotoURL do providerData consistentes com top-level ou já atualizados.");
                }
            }
        }
        currentUser = userObjectToUse;

        if (userInfo) userInfo.textContent = `Logado como: ${finalDisplayName || currentUser.email || "Usuário"}`;
        if (loginButton) loginButton.style.display = 'none';
        if (logoutButton) logoutButton.style.display = 'inline-block';

        // Sua alteração intencional:
        if (tabsContainer) tabsContainer.style.display = 'none';

        const userLoginRef = database.ref(`allUsersLogins/${currentUser.uid}`);
        userLoginRef.set({
            name: finalDisplayName || "Usuário Anônimo",
            photoURL: finalPhotoURL || null,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        }).catch(error => {
            console.error("Erro ao salvar informações de login do usuário:", error);
        });

        const adminStatusRef = database.ref(`admins/${currentUser.uid}`);
        try {
            const snapshot = await adminStatusRef.once('value');
            isCurrentUserAdmin = snapshot.exists() && snapshot.val() === true;
            console.log("Status de Admin:", isCurrentUserAdmin);

            if (adminTabButton) {
                adminTabButton.style.display = isCurrentUserAdmin ? 'inline-block' : 'none';
            }

            if (isCurrentUserAdmin) {
                loadAndRenderAllUsersListForAdmin();
                if (scheduleConfigLoaded) populateScheduleForm(currentScheduleConfig);
            } else {
                const adminPanelTab = document.getElementById('tab-admin-panel');
                if (adminPanelTab && adminPanelTab.classList.contains('active')) {
                    const gameListsTabButton = document.querySelector('.tab-button[data-tab="tab-game-lists"]');
                    if (gameListsTabButton) gameListsTabButton.click();
                }
                if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '';
                allUsersDataForAdminCache = [];
            }

            updateGuestAdditionAvailabilityUI();
            loadLists();

            if (scheduleConfigLoaded) {
                updateListAvailabilityUI();
                if (isCurrentUserAdmin) {
                    checkAndPerformAdminAutoAdd();
                }
            }
        } catch (error) {
            console.error("Erro ao verificar admin:", error);
            isCurrentUserAdmin = false;
            if (adminTabButton) adminTabButton.style.display = 'none';
            updateGuestAdditionAvailabilityUI();
            loadLists();
            if (scheduleConfigLoaded) updateListAvailabilityUI();
        }

    } else {
        isCurrentUserAdmin = false;
        currentUser = null;
        updateGuestAdditionAvailabilityUI();
        if (userInfo) userInfo.textContent = 'Por favor, faça login para participar.';
        if (loginButton) loginButton.style.display = 'inline-block';
        if (logoutButton) logoutButton.style.display = 'none';
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (adminTabButton) adminTabButton.style.display = 'none';

        if (listStatusMessageElement) {
            if (scheduleConfigLoaded) updateListAvailabilityUI();
            else listStatusMessageElement.textContent = '';
        }
        if (confirmPresenceButton) confirmPresenceButton.disabled = true;
        if (isGoalkeeperCheckbox) isGoalkeeperCheckbox.checked = false;
        if (needsToleranceCheckbox) needsToleranceCheckbox.checked = false;

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

if (tabButtons && tabContents) {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const targetTabId = button.getAttribute('data-tab');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) targetContent.classList.add('active');
            if (targetTabId === 'tab-admin-panel' && isCurrentUserAdmin) {
                if (scheduleConfigLoaded) populateScheduleForm(currentScheduleConfig);
                if (adminSearchUserInput) filterAndRenderAdminUserList(adminSearchUserInput.value);
            }
        });
    });
}

async function checkAndPerformAdminAutoAdd() {
    if (!isCurrentUserAdmin || !scheduleConfigLoaded || !isListCurrentlyOpen()) {
        if (!scheduleConfigLoaded) console.log("Auto-add: Horários não carregados.");
        else if (!isListCurrentlyOpen()) console.log("Auto-add: Lista não está aberta.");
        return;
    }
    const currentCycleTimestamp = getMostRecentListOpenTimestamp();
    const scheduleStateRef = database.ref('scheduleState/lastAdminAutoAddCycleTimestamp');

    try {
        const snapshot = await scheduleStateRef.once('value');
        const lastCycleTimestamp = snapshot.val() || 0;

        if (currentCycleTimestamp > lastCycleTimestamp) {
            console.log("Novo ciclo, adicionando admins...");

            const adminsSnapshot = await database.ref('admins').once('value');
            const adminUidsMap = adminsSnapshot.val();
            if (!adminUidsMap) {
                console.log("Nenhum admin configurado em /admins.");
                await scheduleStateRef.set(currentCycleTimestamp);
                return;
            }
            const adminUids = Object.keys(adminUidsMap);

            const [confirmedSnapshot, allLoginsSnapshot] = await Promise.all([
                confirmedPlayersRef.once('value'),
                database.ref('allUsersLogins').once('value')
            ]);

            let confirmedPlayers = confirmedSnapshot.val() || {};
            const allLogins = allLoginsSnapshot.val() || {};

            let localConfirmedPlayersArray = Object.values(confirmedPlayers);
            let numConfirmedFieldPlayers = localConfirmedPlayersArray.filter(p => !p.isGoalkeeper).length;
            let numConfirmedGoalkeepers = localConfirmedPlayersArray.filter(p => p.isGoalkeeper).length;

            let adminsAddedCount = 0;
            for (const adminUid of adminUids) {
                if (!confirmedPlayers[adminUid]) {
                    const adminLoginData = allLogins[adminUid];
                    const adminName = adminLoginData?.name || `Admin ${adminUid.substring(0, 6)}`;
                    const adminPhotoURL = adminLoginData?.photoURL || null;

                    const isAdminGoalkeeper = false;
                    let canAddAdmin = false;

                    if (isAdminGoalkeeper) {
                        if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) canAddAdmin = true;
                    } else {
                        if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) canAddAdmin = true;
                    }

                    if (canAddAdmin) {
                        const adminData = {
                            name: adminName,
                            isGoalkeeper: isAdminGoalkeeper,
                            needsTolerance: false,
                            photoURL: adminPhotoURL,
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        };
                        await confirmedPlayersRef.child(adminUid).set(adminData);
                        console.log(`Admin ${adminName} adicionado automaticamente.`);
                        adminsAddedCount++;
                        confirmedPlayers[adminUid] = adminData;
                        if (isAdminGoalkeeper) numConfirmedGoalkeepers++; else numConfirmedFieldPlayers++;
                    } else {
                        console.log(`Admin ${adminName} não pôde ser adicionado automaticamente (limite).`);
                    }
                } else {
                    console.log(`Admin ${allLogins[adminUid]?.name || adminUid.substring(0, 6)} já está na lista.`);
                }
            }

            if (adminsAddedCount > 0) displayErrorMessage(`${adminsAddedCount} administrador(es) adicionado(s) automaticamente.`);
            else if (adminUids.length > 0) console.log("Admins para auto-add já na lista ou sem vagas.");

            await scheduleStateRef.set(currentCycleTimestamp);
        } else {
            console.log("Adição de admins para este ciclo já feita ou não é o momento.");
        }
    } catch (error) {
        console.error("Erro na adição automática de admins:", error);
        displayErrorMessage("Erro ao adicionar admins automaticamente.");
    }
}

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

confirmPresenceButton.addEventListener('click', () => {
    if (!currentUser) {
        displayErrorMessage("Você precisa estar logado para confirmar presença.");
        return;
    }
    if (!isCurrentUserAdmin && !isListCurrentlyOpen()) {
        displayErrorMessage("A lista de presença não está aberta no momento.");
        return;
    }

    const isGoalkeeperForTransaction = isGoalkeeperCheckbox.checked;
    const needsToleranceForTransaction = needsToleranceCheckbox.checked;
    const playerIdForTransaction = currentUser.uid;
    const playerNameForTransaction = (currentUser && currentUser.displayName) ? currentUser.displayName : "Jogador Anônimo";
    const playerPhotoURLForTransaction = (currentUser && currentUser.photoURL) ? currentUser.photoURL : null;

    const listaFutebolRef = database.ref('listaFutebol');
    displayErrorMessage("Processando sua confirmação...");

    listaFutebolRef.transaction((currentListaFutebolData) => {
        if (currentListaFutebolData === null) {
            currentListaFutebolData = { jogadoresConfirmados: {}, listaEspera: {} };
        }
        const confirmedPlayers = currentListaFutebolData.jogadoresConfirmados || {};
        const waitingPlayers = currentListaFutebolData.listaEspera || {};

        if (confirmedPlayers[playerIdForTransaction] || waitingPlayers[playerIdForTransaction]) {
            console.log("Transação: Usuário já está na lista. Abortando.");
            return undefined;
        }

        const confirmedPlayersArray = Object.values(confirmedPlayers);
        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const playerData = {
            name: playerNameForTransaction,
            isGoalkeeper: isGoalkeeperForTransaction,
            needsTolerance: needsToleranceForTransaction,
            photoURL: playerPhotoURLForTransaction,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        let madeChange = false;
        if (isGoalkeeperForTransaction) {
            if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                confirmedPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            } else {
                waitingPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            }
        } else {
            if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                confirmedPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            } else {
                waitingPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            }
        }

        if (madeChange) {
            currentListaFutebolData.jogadoresConfirmados = confirmedPlayers;
            currentListaFutebolData.listaEspera = waitingPlayers;
            return currentListaFutebolData;
        } else {
            return undefined;
        }
    }, (error, committed, snapshot) => {
        if (error) {
            console.error("Falha na transação:", error);
            displayErrorMessage("Erro ao processar sua confirmação. Tente novamente.");
        } else if (!committed) {
            console.log("Transação não efetivada.");
            database.ref(`listaFutebol/jogadoresConfirmados/${playerIdForTransaction}`).once('value', sConfirm => {
                database.ref(`listaFutebol/listaEspera/${playerIdForTransaction}`).once('value', sWait => {
                    if (sConfirm.exists() || sWait.exists()) {
                        displayErrorMessage("Você já está na lista ou na espera (verificado no servidor).");
                    } else {
                        displayErrorMessage("Não foi possível confirmar. Vagas podem ter sido preenchidas ou houve um conflito.");
                    }
                });
            });
        } else {
            console.log("Confirmação processada com sucesso pelo servidor.");
            const dataCommitted = snapshot.val();
            if (dataCommitted && dataCommitted.jogadoresConfirmados && dataCommitted.jogadoresConfirmados[playerIdForTransaction]) {
                const p = dataCommitted.jogadoresConfirmados[playerIdForTransaction];
                displayErrorMessage(`${p.name}, presença ${p.isGoalkeeper ? 'como goleiro(a)' : ''} confirmada!`);
            } else if (dataCommitted && dataCommitted.listaEspera && dataCommitted.listaEspera[playerIdForTransaction]) {
                const p = dataCommitted.listaEspera[playerIdForTransaction];
                displayErrorMessage(`${p.name}, você foi adicionado(a) à lista de espera.`);
            } else {
                displayErrorMessage("Sua solicitação foi processada com sucesso!");
            }
        }
        if (isGoalkeeperCheckbox) isGoalkeeperCheckbox.checked = false;
        if (needsToleranceCheckbox) needsToleranceCheckbox.checked = false;
    });
});

function displayGuestAddStatus(message, isError = false) {
    if (guestAddStatusElement) {
        guestAddStatusElement.textContent = message;
        guestAddStatusElement.className = `status-feedback ${isError ? 'error' : 'success'} visible`;
        setTimeout(() => {
            if (guestAddStatusElement) {
                guestAddStatusElement.textContent = '';
                guestAddStatusElement.classList.remove('visible', 'error', 'success');
            }
        }, 4000);
    }
}

if (addGuestButton) {
    addGuestButton.addEventListener('click', () => {
        if (!currentUser) {
            displayGuestAddStatus("Você precisa estar logado para adicionar um convidado.", true);
            return;
        }
        if (!isCurrentUserAdmin && !isListCurrentlyOpen()) {
            displayGuestAddStatus("A lista de presença não está aberta para adicionar convidados no momento.", true);
            return;
        }
        if (!isCurrentUserAdmin && !isItFridayInBrasilia()) {
            displayGuestAddStatus("Convidados só podem ser adicionados às sextas-feiras por não-administradores.", true);
            return;
        }

        const guestName = guestNameInput.value.trim();
        if (!guestName) {
            displayGuestAddStatus("Por favor, insira o nome do convidado.", true);
            return;
        }

        const guestIsGoalkeeper = guestIsGoalkeeperCheckbox.checked;
        const guestId = 'guest_' + database.ref().push().key;
        const currentUserNameForGuest = (currentUser && currentUser.displayName) ? currentUser.displayName : "Anfitrião";

        displayGuestAddStatus(`Adicionando ${guestName}...`, false);

        const listaFutebolRef = database.ref('listaFutebol');
        listaFutebolRef.transaction((currentListaFutebolData) => {
            if (currentListaFutebolData === null) {
                currentListaFutebolData = { jogadoresConfirmados: {}, listaEspera: {} };
            }
            const confirmedPlayers = currentListaFutebolData.jogadoresConfirmados || {};
            const waitingPlayers = currentListaFutebolData.listaEspera || {};

            const guestAlreadyExists = Object.values(confirmedPlayers).some(p => p.isGuest && p.name === guestName && p.addedByUid === currentUser.uid) ||
                Object.values(waitingPlayers).some(p => p.isGuest && p.name === guestName && p.addedByUid === currentUser.uid);
            if (guestAlreadyExists) {
                console.log("Convidado já adicionado por este usuário.");
                return { _transaction_aborted_reason: "guest_exists" };
            }

            const confirmedPlayersArray = Object.values(confirmedPlayers);
            const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
            const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

            const guestPlayerData = {
                name: guestName,
                isGoalkeeper: guestIsGoalkeeper,
                isGuest: true,
                addedByUid: currentUser.uid,
                addedByName: currentUserNameForGuest,
                needsTolerance: false,
                photoURL: null,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            let actionTaken = null;
            if (guestIsGoalkeeper) {
                if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                    confirmedPlayers[guestId] = guestPlayerData;
                    actionTaken = 'guest_confirmed_gk';
                } else {
                    waitingPlayers[guestId] = guestPlayerData;
                    actionTaken = 'guest_waiting_gk';
                }
            } else {
                if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                    confirmedPlayers[guestId] = guestPlayerData;
                    actionTaken = 'guest_confirmed_fp';
                } else {
                    waitingPlayers[guestId] = guestPlayerData;
                    actionTaken = 'guest_waiting_fp';
                }
            }

            if (actionTaken) {
                currentListaFutebolData.jogadoresConfirmados = confirmedPlayers;
                currentListaFutebolData.listaEspera = waitingPlayers;
                return currentListaFutebolData;
            } else {
                return undefined;
            }
        }, (error, committed, snapshot) => {
            if (error) {
                console.error("Transação para adicionar convidado falhou:", error);
                displayGuestAddStatus("Erro ao adicionar convidado. Tente novamente.", true);
            } else if (!committed) {
                const abortedData = snapshot.val();
                if (abortedData && abortedData._transaction_aborted_reason === "guest_exists") {
                    displayGuestAddStatus("Você já adicionou um convidado com este nome.", true);
                } else {
                    displayGuestAddStatus("Não foi possível adicionar o convidado (lista cheia ou conflito).", true);
                }
            } else {
                const dataCommitted = snapshot.val();
                let successMessage = "Convidado adicionado com sucesso!";
                if (dataCommitted.jogadoresConfirmados && dataCommitted.jogadoresConfirmados[guestId]) {
                    successMessage = `${guestName} (convidado) adicionado à lista principal!`;
                } else if (dataCommitted.listaEspera && dataCommitted.listaEspera[guestId]) {
                    successMessage = `${guestName} (convidado) adicionado à lista de espera.`;
                }
                displayGuestAddStatus(successMessage, false);
                if (guestNameInput) guestNameInput.value = '';
                if (guestIsGoalkeeperCheckbox) guestIsGoalkeeperCheckbox.checked = false;
            }
        });
    });
}

async function addToWaitingList(playerId, playerName, isGoalkeeper, dataToSet = null) {
    try {
        const waitingData = dataToSet ? { ...dataToSet } : {
            name: playerName,
            isGoalkeeper: isGoalkeeper,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        if (!dataToSet || !dataToSet.timestamp) {
            waitingData.timestamp = firebase.database.ServerValue.TIMESTAMP;
        }
        // Garante que photoURL e needsTolerance são tratados se vierem de dataToSet
        if (dataToSet && typeof dataToSet.photoURL !== 'undefined' && !waitingData.hasOwnProperty('photoURL')) {
            waitingData.photoURL = dataToSet.photoURL;
        }
        if (dataToSet && typeof dataToSet.needsTolerance !== 'undefined' && !waitingData.hasOwnProperty('needsTolerance')) {
            waitingData.needsTolerance = dataToSet.needsTolerance;
        }


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

function formatPlayerTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
}

function renderPlayerListItem(player, index, listTypeIdentifier) {
    const li = document.createElement('li');

    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add('player-avatar-container');
    const avatarElement = document.createElement('div');
    avatarElement.classList.add('player-avatar');

    if (player.photoURL) {
        const img = document.createElement('img');
        img.src = player.photoURL;
        img.alt = player.name.substring(0, 1);
        img.onerror = function () {
            this.parentElement.innerHTML = '<i class="fas fa-user-circle"></i>';
        };
        avatarElement.appendChild(img);
    } else {
        avatarElement.innerHTML = '<i class="fas fa-user-circle"></i>';
    }
    avatarContainer.appendChild(avatarElement);
    li.appendChild(avatarContainer);

    const detailsContainer = document.createElement('div');
    detailsContainer.classList.add('player-details-main');

    const nameMain = document.createElement('div');
    nameMain.classList.add('player-name-display');
    // A numeração da ordem foi removida para o layout estilo WhatsApp
    // Se quiser de volta, adicione o 'orderSpan' aqui.
    nameMain.textContent = player.name;
    detailsContainer.appendChild(nameMain);

    if (player.timestamp) {
        const timestampElem = document.createElement('div');
        timestampElem.classList.add('player-confirmation-timestamp');
        timestampElem.textContent = formatPlayerTimestamp(player.timestamp);
        detailsContainer.appendChild(timestampElem);
    }

    const extraTagsContainer = document.createElement('div');
    extraTagsContainer.classList.add('player-additional-tags');

    if (player.isGoalkeeper) {
        const gkIndicator = document.createElement('span');
        gkIndicator.textContent = '(Goleiro)';
        if (listTypeIdentifier !== 'confirmed-gk') {
            extraTagsContainer.appendChild(gkIndicator);
        }
    }
    if (player.needsTolerance === true) {
        const toleranceIndicator = document.createElement('span');
        toleranceIndicator.classList.add('tolerance-tag');
        toleranceIndicator.innerHTML = '<i class="far fa-clock"></i><span class="tolerance-text">(+10min)</span>';
        toleranceIndicator.title = "Precisa de 10 minutos de tolerância";
        extraTagsContainer.appendChild(toleranceIndicator);
    }
    if (player.isGuest && player.addedByName) {
        const guestIndicator = document.createElement('span');
        guestIndicator.classList.add('guest-tag');
        guestIndicator.textContent = `(Convidado por: ${player.addedByName})`;
        extraTagsContainer.appendChild(guestIndicator);
    }
    if (extraTagsContainer.hasChildNodes()) {
        detailsContainer.appendChild(extraTagsContainer);
    }

    li.appendChild(detailsContainer);

    let showRemoveButton = false;
    let buttonText = "Sair";
    let buttonIcon = "fas fa-sign-out-alt";
    let buttonSpecificClass = "";

    if (currentUser) {
        if (player.isGuest) {
            if (isCurrentUserAdmin || (player.addedByUid && player.addedByUid === currentUser.uid)) {
                showRemoveButton = true;
                buttonText = "";
                buttonIcon = "fas fa-user-minus";
                buttonSpecificClass = "remove-guest-btn";
            }
        } else {
            if (isCurrentUserAdmin || currentUser.uid === player.id) {
                showRemoveButton = true;
                if (isCurrentUserAdmin && currentUser.uid !== player.id) {
                    buttonText = "";
                    buttonIcon = "fas fa-user-times";
                    buttonSpecificClass = "admin-remove-player-btn";
                } else {
                    buttonText = "";
                }
            }
        }
    }

    if (showRemoveButton) {
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-button');
        if (buttonSpecificClass) removeBtn.classList.add(buttonSpecificClass);

        removeBtn.innerHTML = `<i class="${buttonIcon}"></i>`;
        if (buttonText) {
            // Se o botão tiver texto (atualmente configurado para não ter para economizar espaço)
            // removeBtn.appendChild(document.createTextNode(` ${buttonText}`));
        }
        removeBtn.title = (buttonText === "Sair" || buttonIcon === "fas fa-sign-out-alt") ? "Sair da lista" : "Remover";

        if (buttonSpecificClass === "admin-remove-player-btn") {
            removeBtn.style.backgroundColor = '#f39c12';
        } else if (buttonSpecificClass === "remove-guest-btn") {
            removeBtn.style.backgroundColor = '#d9534f';
        }
        const listTypeForRemove = listTypeIdentifier.startsWith('confirmed') ? 'confirmed' : 'waiting';
        removeBtn.onclick = () => removePlayer(player.id, listTypeForRemove);
        li.appendChild(removeBtn);
    }
    return li;
}

function renderConfirmedLists(confirmedPlayersObject) {
    if (confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.innerHTML = '';
    if (confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.innerHTML = '';

    if (!confirmedPlayersObject) {
        if (confirmedGkCountSpan) confirmedGkCountSpan.textContent = 0;
        if (confirmedFpCountSpan) confirmedFpCountSpan.textContent = 0;
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
        if (confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-gk'));
    });
    if (confirmedGkCountSpan) confirmedGkCountSpan.textContent = goalkeepers.length;

    fieldPlayers.forEach((player, index) => {
        if (confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-fp'));
    });
    if (confirmedFpCountSpan) confirmedFpCountSpan.textContent = fieldPlayers.length;
}

function renderWaitingList(waitingPlayersObject) {
    if (waitingListElement) waitingListElement.innerHTML = '';
    if (!waitingPlayersObject) {
        if (waitingCountSpan) waitingCountSpan.textContent = 0;
        return;
    }

    const waitingArray = Object.entries(waitingPlayersObject)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp);

    waitingArray.forEach((player, index) => {
        if (waitingListElement) waitingListElement.appendChild(renderPlayerListItem(player, index, 'waiting'));
    });
    if (waitingCountSpan) waitingCountSpan.textContent = waitingArray.length;
}

function clearListsUI() {
    if (confirmedGoalkeepersListElement) confirmedGoalkeepersListElement.innerHTML = '';
    if (confirmedFieldPlayersListElement) confirmedFieldPlayersListElement.innerHTML = '';
    if (waitingListElement) waitingListElement.innerHTML = '';
    if (confirmedGkCountSpan) confirmedGkCountSpan.textContent = '0';
    if (confirmedFpCountSpan) confirmedFpCountSpan.textContent = '0';
    if (waitingCountSpan) waitingCountSpan.textContent = '0';
    if (listStatusMessageElement) listStatusMessageElement.textContent = '';
}

function renderAdminUserListItemForPanel(user, isConfirmed, isInWaitingList) {
    const li = document.createElement('li');
    li.classList.add('admin-user-item');

    const userInfoDiv = document.createElement('div');
    userInfoDiv.classList.add('admin-user-info');
    userInfoDiv.innerHTML = `<strong>${user.name}</strong>`;

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

        const needsToleranceLabelForAdmin = document.createElement('label');
        needsToleranceLabelForAdmin.textContent = 'Tolerância? ';
        needsToleranceLabelForAdmin.style.marginRight = '5px';
        needsToleranceLabelForAdmin.style.fontSize = '0.9em';

        const needsToleranceCheckboxForAdmin = document.createElement('input');
        needsToleranceCheckboxForAdmin.type = 'checkbox';
        needsToleranceCheckboxForAdmin.id = `admin-add-nt-${user.id}`;
        needsToleranceCheckboxForAdmin.classList.add('admin-add-gk-checkbox');
        needsToleranceCheckboxForAdmin.style.verticalAlign = 'middle';
        needsToleranceLabelForAdmin.htmlFor = needsToleranceCheckboxForAdmin.id;

        const addButton = document.createElement('button');
        addButton.innerHTML = '<i class="fas fa-user-plus"></i> Adicionar';
        addButton.classList.add('admin-add-button');
        addButton.onclick = () => adminAddPlayerToGame(user.id, user.name, isGoalkeeperCheckboxForAdmin.checked, needsToleranceCheckboxForAdmin.checked);

        actionsDiv.appendChild(gkLabel);
        actionsDiv.appendChild(isGoalkeeperCheckboxForAdmin);
        actionsDiv.appendChild(needsToleranceLabelForAdmin);
        actionsDiv.appendChild(needsToleranceCheckboxForAdmin);
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

async function adminAddPlayerToGame(playerId, playerName, isPlayerGoalkeeper, isPlayerNeedsTolerance) {
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
            if (isCurrentUserAdmin && document.getElementById('tab-admin-panel')?.classList.contains('active')) {
                filterAndRenderAdminUserList(adminSearchUserInput ? adminSearchUserInput.value : "");
            }
            return;
        }

        const userLoginDataSnapshot = await database.ref(`allUsersLogins/${playerId}`).once('value');
        const userLoginData = userLoginDataSnapshot.val();
        const photoURLForAdd = userLoginData?.photoURL || null;

        const playerData = {
            name: playerName,
            isGoalkeeper: isPlayerGoalkeeper,
            needsTolerance: isPlayerNeedsTolerance,
            photoURL: photoURLForAdd,
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
        if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '<li>Erro ao carregar status dos jogadores.</li>';
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
            if (adminPanelTab && adminPanelTab.classList.contains('active')) {
                filterAndRenderAdminUserList(adminSearchUserInput ? adminSearchUserInput.value : "");
            }
        } else {
            allUsersDataForAdminCache = [];
            if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '<li>Nenhum login de usuário registrado ainda.</li>';
        }
    }, error => {
        console.error("Erro ao carregar lista de usuários para admin:", error);
        if (adminAllUsersListElement) adminAllUsersListElement.innerHTML = '<li>Erro ao carregar lista de usuários.</li>';
        allUsersDataForAdminCache = [];
    });
}

function populateScheduleForm(scheduleData) {
    if (!isCurrentUserAdmin) return;

    if (adminOpenDaySelect && scheduleData) adminOpenDaySelect.value = String(scheduleData.openDay);
    if (adminOpenHourInput && scheduleData) adminOpenHourInput.value = String(scheduleData.openHour);
    if (adminOpenMinuteInput && scheduleData) adminOpenMinuteInput.value = String(scheduleData.openMinute);
    if (adminCloseDaySelect && scheduleData) adminCloseDaySelect.value = String(scheduleData.closeDay);
    if (adminCloseHourInput && scheduleData) adminCloseHourInput.value = String(scheduleData.closeHour);
    if (adminCloseMinuteInput && scheduleData) adminCloseMinuteInput.value = String(scheduleData.closeMinute);
}

function loadLists() {
    if (scheduleConfigLoaded) updateListAvailabilityUI();

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
            if (displayErrorMessage) displayErrorMessage("Não foi possível carregar a lista de confirmados.");
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
            if (displayErrorMessage) displayErrorMessage("Não foi possível carregar a lista de espera.");
        });
    }
}

if (saveScheduleButton) {
    saveScheduleButton.addEventListener('click', async () => {
        if (!isCurrentUserAdmin) {
            displayErrorMessage("Apenas administradores podem salvar horários.");
            return;
        }
        const newSchedule = {
            openDay: parseInt(adminOpenDaySelect.value),
            openHour: parseInt(adminOpenHourInput.value),
            openMinute: parseInt(adminOpenMinuteInput.value),
            closeDay: parseInt(adminCloseDaySelect.value),
            closeHour: parseInt(adminCloseHourInput.value),
            closeMinute: parseInt(adminCloseMinuteInput.value)
        };
        let isValid = true;
        const fieldsToValidate = [
            { value: newSchedule.openHour, min: 0, max: 23, name: "Hora Abertura" },
            { value: newSchedule.openMinute, min: 0, max: 59, name: "Minuto Abertura" },
            { value: newSchedule.closeHour, min: 0, max: 23, name: "Hora Fechamento" },
            { value: newSchedule.closeMinute, min: 0, max: 59, name: "Minuto Fechamento" }
        ];
        for (const field of fieldsToValidate) {
            if (isNaN(field.value) || field.value < field.min || field.value > field.max) {
                isValid = false;
                if (scheduleSaveStatusElement) {
                    scheduleSaveStatusElement.textContent = `Valor inválido para ${field.name}. Use ${field.min}-${field.max}.`;
                    scheduleSaveStatusElement.className = 'status-feedback error visible';
                }
                break;
            }
        }
        if (isNaN(newSchedule.openDay) || isNaN(newSchedule.closeDay)) isValid = false;
        if (!isValid) {
            setTimeout(() => { if (scheduleSaveStatusElement) { scheduleSaveStatusElement.textContent = ''; scheduleSaveStatusElement.classList.remove('visible', 'error'); } }, 4000);
            return;
        }
        if (scheduleSaveStatusElement) {
            scheduleSaveStatusElement.textContent = "Salvando...";
            scheduleSaveStatusElement.className = 'status-feedback neutral visible';
        }
        try {
            await database.ref('scheduleSettings').set(newSchedule);
            if (scheduleSaveStatusElement) {
                scheduleSaveStatusElement.textContent = "Horários salvos com sucesso!";
                scheduleSaveStatusElement.className = 'status-feedback success visible';
            }
        } catch (error) {
            console.error("Erro ao salvar horários:", error);
            if (scheduleSaveStatusElement) {
                scheduleSaveStatusElement.textContent = "Erro ao salvar. Tente novamente.";
                scheduleSaveStatusElement.className = 'status-feedback error visible';
            }
        }
        setTimeout(() => { if (scheduleSaveStatusElement) { scheduleSaveStatusElement.textContent = ''; scheduleSaveStatusElement.classList.remove('visible', 'success', 'error', 'neutral'); } }, 3000);
    });
}

if (adminSearchUserInput) {
    adminSearchUserInput.addEventListener('input', (e) => {
        if (isCurrentUserAdmin) {
            filterAndRenderAdminUserList(e.target.value);
        }
    });
}

fetchScheduleSettings();