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
let listStatusUpdateInterval = null; // Para controlar nosso temporizador
const LIST_STATUS_UPDATE_INTERVAL_MS = 20 * 1000; // Verificar a cada 30 segundos
// --- Lógica de Horário e Fuso Horário de Brasília ---
function getCurrentBrasiliaDateTimeParts() {
    const nowUtc = new Date();
    // 'en-US' é usado para um formato de string mais previsível para o construtor new Date()
    // A conversão de fuso é feita por timeZone: 'America/Sao_Paulo'
    const brasiliaDateString = nowUtc.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brasiliaEquivalentDate = new Date(brasiliaDateString);

    return {
        dayOfWeek: brasiliaEquivalentDate.getDay(), // 0 (Dom) a 6 (Sáb)
        hour: brasiliaEquivalentDate.getHours(),
        minute: brasiliaEquivalentDate.getMinutes(),
        dateObject: brasiliaEquivalentDate // O objeto Date para mais cálculos se necessário
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

    if (currentDay === currentScheduleConfig.openDay) { // Dia de abertura (ex: Quarta)
        return currentHour > currentScheduleConfig.openHour || (currentHour === currentScheduleConfig.openHour && currentMinute >= currentScheduleConfig.openMinute);
    }
    if (currentDay > currentScheduleConfig.openDay && currentDay < currentScheduleConfig.closeDay) { // Dias intermediários (ex: Quinta, Sexta)
        return true;
    }
    if (currentDay === currentScheduleConfig.closeDay) { // Dia de fechamento (ex: Sábado)
        return currentHour < currentScheduleConfig.closeHour || (currentHour === currentScheduleConfig.closeHour && currentMinute < currentScheduleConfig.closeMinute);
    }
    return false; // Fora do período
}

function getMostRecentListOpenTimestamp() {
    if (!scheduleConfigLoaded) {
        // Não deve ser chamada antes das configs carregarem para lógica crítica como auto-add.
        // Se chamada, usará os defaults em currentScheduleConfig, o que pode ser ok para UI inicial.
        console.warn("getMostRecentListOpenTimestamp chamada antes das configs do Firebase serem totalmente carregadas. Usando defaults se disponíveis.");
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
    if (!scheduleConfigLoaded && !currentUser) { // Se deslogado e config não carregou
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
            if (currentScheduleConfig.closeMinute === 1 && currentScheduleConfig.closeHour === 16) { // Lógica específica para "16:01 perde a vaga"
                closeMinuteDisplay = "01";
            }
            const closeTimeStr = `${dias[currentScheduleConfig.closeDay]} às ${String(currentScheduleConfig.closeHour).padStart(2, '0')}:${closeMinuteDisplay}`;

            listStatusMessageElement.textContent = `Lista FECHADA. Abre ${openTimeStr}, fecha ${closeTimeStr}.`;
            listStatusMessageElement.className = 'list-status closed';
        }
    }
}

// --- Carregar Configurações de Horário do Firebase ---
//function fetchScheduleSettings() {
//    const scheduleSettingsRef = database.ref('scheduleSettings');
//    scheduleSettingsRef.on('value', (snapshot) => {
//        const settings = snapshot.val();
//        if (settings && typeof settings.openDay === 'number' && typeof settings.openHour === 'number') {
//            currentScheduleConfig = settings;
//            console.log("Configurações de horário carregadas/atualizadas do Firebase:", currentScheduleConfig);
//        } else {
//            console.warn("Config. de horário não encontradas ou inválidas no Firebase. Usando padrões.");
//            // currentScheduleConfig já tem os valores padrão definidos no script
//        }
//        scheduleConfigLoaded = true;

//        // Chamada inicial para atualizar a UI com as configs carregadas/padrão
//        updateListAvailabilityUI();

//        if (currentUser) {
//            checkAndPerformAdminAutoAdd(); // Verifica se precisa adicionar admins
//        }

//        // Inicia ou reinicia o intervalo para atualizações automáticas de status da lista
//        if (listStatusUpdateInterval) {
//            clearInterval(listStatusUpdateInterval); // Limpa o intervalo anterior, se houver
//        }
//        listStatusUpdateInterval = setInterval(() => {
//            // console.log("Intervalo: Verificando status da lista..."); // Para depuração
//            updateListAvailabilityUI(); // Chama a função que reavalia e atualiza a UI
//        }, LIST_STATUS_UPDATE_INTERVAL_MS);

//    }, (error) => {
//        console.error("Erro ao buscar configurações de horário:", error);
//        scheduleConfigLoaded = true; // Marca como carregado para não bloquear, usará defaults
//        updateListAvailabilityUI(); // Atualiza UI mesmo com erro (usando defaults)

//        // Mesmo com erro, podemos iniciar o intervalo caso os defaults permitam abrir depois
//        if (listStatusUpdateInterval) {
//            clearInterval(listStatusUpdateInterval);
//        }
//        listStatusUpdateInterval = setInterval(() => {
//            updateListAvailabilityUI();
//        }, LIST_STATUS_UPDATE_INTERVAL_MS);
//    });
//}

function fetchScheduleSettings() {
    const scheduleSettingsRef = database.ref('scheduleSettings');
    scheduleSettingsRef.on('value', (snapshot) => {
        const settings = snapshot.val();
        if (settings && typeof settings.openDay === 'number' && typeof settings.openHour === 'number') {
            currentScheduleConfig = settings;
            console.log("Configurações de horário carregadas/atualizadas:", currentScheduleConfig);
        } else {
            console.warn("Config. de horário não encontradas ou inválidas. Usando padrões.");
            // currentScheduleConfig já tem os valores padrão
        }
        scheduleConfigLoaded = true;

        updateListAvailabilityUI();

        if (currentUser) {
            populateScheduleForm(currentScheduleConfig); // Popula o formulário quando as configs carregam/mudam
            checkAndPerformAdminAutoAdd();
        }
        // ... (resto da lógica de iniciar o intervalo de atualização)
        if (listStatusUpdateInterval) clearInterval(listStatusUpdateInterval);
        listStatusUpdateInterval = setInterval(() => {
            updateListAvailabilityUI();
        }, LIST_STATUS_UPDATE_INTERVAL_MS);

    }, (error) => {
        console.error("Erro ao buscar config. de horário:", error);
        scheduleConfigLoaded = true;
        updateListAvailabilityUI();
        if (currentUser && isCurrentUserAdmin) { // Popula com defaults mesmo em erro
            populateScheduleForm(currentScheduleConfig);
        }
        if (listStatusUpdateInterval) clearInterval(listStatusUpdateInterval);
        listStatusUpdateInterval = setInterval(() => {
            updateListAvailabilityUI();
        }, LIST_STATUS_UPDATE_INTERVAL_MS);
    });
}


// --- Lógica de Autenticação ---
auth.onAuthStateChanged(async user => { // Mantenha async
    if (user) {
        let userObjectToUse = user; // Começa com o objeto 'user' do callback

        try {
            console.log("onAuthStateChanged - Tentando user.reload() para perfil atualizado...");
            await userObjectToUse.reload();
            userObjectToUse = auth.currentUser; // Pega o objeto de usuário mais fresco após o reload
            console.log("user.reload() bem-sucedido. displayName atual (antes de providerData):", userObjectToUse.displayName);
        } catch (error) {
            console.error("Erro durante user.reload():", error);
            // Em caso de falha no reload, continua com o objeto 'user' que recebemos
        }

        // Agora, verifica providerData e atualiza o perfil do Firebase se necessário
        let finalDisplayName = userObjectToUse.displayName; // Começa com o displayName atual
        const providerData = userObjectToUse.providerData;

        if (providerData && providerData.length > 0) {
            const googleInfo = providerData.find(p => p.providerId === 'google.com');
            if (googleInfo && googleInfo.displayName) {
                if (googleInfo.displayName !== finalDisplayName) {
                    console.log(`DisplayName divergente. Top-level: "${finalDisplayName}", ProviderData: "${googleInfo.displayName}". Tentando atualizar perfil do Firebase.`);
                    finalDisplayName = googleInfo.displayName; // Usa o nome do providerData
                    try {
                        await userObjectToUse.updateProfile({ displayName: finalDisplayName });
                        userObjectToUse = auth.currentUser; // Pega o usuário mais atualizado possível após updateProfile
                        finalDisplayName = userObjectToUse.displayName; // Confirma o nome final
                        console.log("Perfil do Firebase atualizado com displayName do providerData. Novo displayName:", finalDisplayName);
                    } catch (updateError) {
                        console.error("Erro ao atualizar o perfil do Firebase com displayName do providerData:", updateError);
                        // Se updateProfile falhar, finalDisplayName já tem o valor do providerData para uso nesta sessão
                    }
                } else {
                    // O displayName do providerData já é o mesmo do top-level, ou o top-level é nulo e o providerData tem um nome
                    finalDisplayName = googleInfo.displayName || finalDisplayName; // Garante que temos o nome se o top-level era nulo
                    console.log("DisplayName do providerData (" + googleInfo.displayName + ") é o mesmo do top-level ou o top-level foi atualizado.");
                }
            }
        }

        currentUser = userObjectToUse; // Define o currentUser global com o objeto mais atualizado que temos

        // --- O RESTANTE DA SUA LÓGICA onAuthStateChanged CONTINUA AQUI ---
        // Use 'finalDisplayName' para exibição e para salvar no seu banco de dados (allUsersLogins)
        if (userInfo) userInfo.textContent = `Logado como: ${finalDisplayName || currentUser.email || "Usuário"}`;
        if (loginButton) loginButton.style.display = 'none';
        if (logoutButton) logoutButton.style.display = 'inline-block';
        if (tabsContainer) tabsContainer.style.display = 'block';

        const userLoginRef = database.ref(`allUsersLogins/${currentUser.uid}`);
        userLoginRef.set({
            name: finalDisplayName || "Usuário Anônimo", // Usa o nome mais preciso
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        }).catch(error => {
            console.error("Erro ao salvar informações de login do usuário:", error);
        });

        // Verificar status de admin
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
            loadLists();
            if (scheduleConfigLoaded) updateListAvailabilityUI();
        }

    } else { // Usuário deslogado
        isCurrentUserAdmin = false;
        currentUser = null;
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
//if (tabButtons && tabContents) {
//    tabButtons.forEach(button => {
//        button.addEventListener('click', () => {
//            tabButtons.forEach(btn => btn.classList.remove('active'));
//            tabContents.forEach(content => content.classList.remove('active'));
//            button.classList.add('active');
//            const targetTabId = button.getAttribute('data-tab');
//            const targetContent = document.getElementById(targetTabId);
//            if (targetContent) {
//                targetContent.classList.add('active');
//            }
//            if (targetTabId === 'tab-admin-panel' && isCurrentUserAdmin && adminSearchUserInput) {
//                filterAndRenderAdminUserList(adminSearchUserInput.value);
//            }
//        });
//    });
//}

if (tabButtons && tabContents) {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // ... (código existente para desativar/ativar abas) ...
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const targetTabId = button.getAttribute('data-tab');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            if (targetTabId === 'tab-admin-panel' && isCurrentUserAdmin) {
                if (scheduleConfigLoaded) { // Se as configs já carregaram
                    populateScheduleForm(currentScheduleConfig); // Popula o formulário
                }
                if (adminSearchUserInput) filterAndRenderAdminUserList(adminSearchUserInput.value);
            }
        });
    });
}

// --- Adição Automática de Admins ---
async function checkAndPerformAdminAutoAdd() {
    if (!scheduleConfigLoaded || !isListCurrentlyOpen()) {
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

            let localConfirmedPlayersArray = Object.values(confirmedPlayers); // Para contagem atual
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
                        confirmedPlayers[adminUid] = adminData; // Atualiza cópia local para contagem
                        numConfirmedFieldPlayers++;             // Atualiza contagem local
                    } else {
                        console.log(`Admin ${adminName} não pôde ser adicionado (limite de linha).`);
                    }
                } else {
                    console.log(`Admin ${allLogins[adminUid]?.name || adminUid.substring(0, 6)} já está na lista.`);
                }
            }

            if (adminsAddedCount > 0) console.log(`${adminsAddedCount} administrador(es) adicionado(s).`);
            else if (adminUids.length > 0) console.log("Administradores já estavam na lista ou não havia vagas.");

            await scheduleStateRef.set(currentCycleTimestamp);
        } else {
            console.log("Adição de admins para este ciclo já feita ou não é o momento.");
        }
    } catch (error) {
        console.error("Erro na adição automática de admins:", error);
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
    const playerIdForTransaction = currentUser.uid;
    const playerNameForTransaction = currentUser.displayName || "Jogador Anônimo";

    const listaFutebolRef = database.ref('listaFutebol');
    displayErrorMessage("Processando sua confirmação...");

    listaFutebolRef.transaction((currentListaFutebolData) => {
        if (currentListaFutebolData === null) {
            currentListaFutebolData = {
                jogadoresConfirmados: {},
                listaEspera: {}
            };
        }
        const confirmedPlayers = currentListaFutebolData.jogadoresConfirmados || {};
        const waitingPlayers = currentListaFutebolData.listaEspera || {};

        if (confirmedPlayers[playerIdForTransaction] || waitingPlayers[playerIdForTransaction]) {
            console.log("Transação: Usuário já está na lista. Abortando.");
            return undefined; // Aborta a transação
        }

        const confirmedPlayersArray = Object.values(confirmedPlayers);
        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const playerData = {
            name: playerNameForTransaction,
            isGoalkeeper: isGoalkeeperForTransaction,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        let madeChange = false; // Para rastrear se uma alteração válida foi feita

        if (isGoalkeeperForTransaction) {
            if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                confirmedPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            } else {
                waitingPlayers[playerIdForTransaction] = playerData;
                madeChange = true;
            }
        } else { // Jogador de linha
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
            // NÃO adicione flags _transaction_action ou _transaction_playerName aqui
            return currentListaFutebolData;
        } else {
            // Se nenhuma mudança lógica foi feita (embora o primeiro check de "já na lista" devesse pegar isso)
            return undefined; // Aborta
        }

    }, (error, committed, snapshot) => {
        if (error) {
            console.error("Falha na transação:", error);
            displayErrorMessage("Erro ao processar sua confirmação. Tente novamente.");
        } else if (!committed) {
            console.log("Transação não efetivada.");
            // Verifica novamente o estado atual para dar uma mensagem mais precisa
            database.ref(`listaFutebol/jogadoresConfirmados/${playerIdForTransaction}`).once('value', sConfirm => {
                database.ref(`listaFutebol/listaEspera/${playerIdForTransaction}`).once('value', sWait => {
                    if (sConfirm.exists() || sWait.exists()) {
                        displayErrorMessage("Você já está na lista ou na espera (verificado no servidor).");
                    } else {
                        displayErrorMessage("Não foi possível confirmar. Vagas podem ter sido preenchidas ou houve um conflito. Tente novamente.");
                    }
                });
            });
        } else {
            // Transação bem-sucedida!
            console.log("Confirmação processada com sucesso pelo servidor.");
            const dataCommitted = snapshot.val(); // Este é o novo estado de /listaFutebol

            // Inferir o que aconteceu baseado no snapshot final
            if (dataCommitted && dataCommitted.jogadoresConfirmados && dataCommitted.jogadoresConfirmados[playerIdForTransaction]) {
                const playerCommitted = dataCommitted.jogadoresConfirmados[playerIdForTransaction];
                displayErrorMessage(`${playerCommitted.name}, presença ${playerCommitted.isGoalkeeper ? 'como goleiro(a)' : ''} confirmada!`);
            } else if (dataCommitted && dataCommitted.listaEspera && dataCommitted.listaEspera[playerIdForTransaction]) {
                const playerCommitted = dataCommitted.listaEspera[playerIdForTransaction];
                displayErrorMessage(`${playerCommitted.name}, você foi adicionado(a) à lista de espera.`);
            } else {
                displayErrorMessage("Sua solicitação foi processada com sucesso!"); // Fallback
            }
            // A UI será atualizada pelos listeners .on('value') existentes.
        }
    });
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

        if (isCurrentUserAdmin && currentUser.uid !== player.id) {
            removeBtn.innerHTML = '<i class="fas fa-user-times"></i> Remover'; // Ícone para admin removendo outro
            removeBtn.style.backgroundColor = '#f39c12'; // Cor laranja para ação de admin
        } else {
            removeBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sair'; // Ícone para sair (pode ser o mesmo de logout)
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

// --- Funções para o Painel do Admin ---
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
        // ... (criação do gkLabel e isGoalkeeperCheckboxForAdmin permanece igual) ...
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
        addButton.innerHTML = '<i class="fas fa-user-plus"></i> Adicionar'; // Adiciona o ícone
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

// NOVA FUNÇÃO PARA POPULAR O FORMULÁRIO DE HORÁRIOS
function populateScheduleForm(scheduleData) {
    if (!isCurrentUserAdmin) return; // Segurança extra, mas a aba já controla isso

    if (adminOpenDaySelect) adminOpenDaySelect.value = String(scheduleData.openDay);
    if (adminOpenHourInput) adminOpenHourInput.value = String(scheduleData.openHour);
    if (adminOpenMinuteInput) adminOpenMinuteInput.value = String(scheduleData.openMinute);
    if (adminCloseDaySelect) adminCloseDaySelect.value = String(scheduleData.closeDay);
    if (adminCloseHourInput) adminCloseHourInput.value = String(scheduleData.closeHour);
    if (adminCloseMinuteInput) adminCloseMinuteInput.value = String(scheduleData.closeMinute);
}

// --- Listeners do Firebase para Atualizações em Tempo Real (Listas de Jogo) ---
function loadLists() {
    if (scheduleConfigLoaded) updateListAvailabilityUI(); // Atualiza status da lista baseado nas configs

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

if (saveScheduleButton) {
    saveScheduleButton.addEventListener('click', async () => {
        if (!isCurrentUserAdmin) {
            displayErrorMessage("Apenas administradores podem salvar horários.");
            return;
        }

        // Valida e coleta os dados do formulário
        const newSchedule = {
            openDay: parseInt(adminOpenDaySelect.value),
            openHour: parseInt(adminOpenHourInput.value),
            openMinute: parseInt(adminOpenMinuteInput.value),
            closeDay: parseInt(adminCloseDaySelect.value),
            closeHour: parseInt(adminCloseHourInput.value),
            closeMinute: parseInt(adminCloseMinuteInput.value)
        };

        // Validação básica dos números
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
                    scheduleSaveStatusElement.textContent = `Valor inválido para ${field.name}. Use o intervalo ${field.min}-${field.max}.`;
                    scheduleSaveStatusElement.className = 'status-feedback error visible';
                }
                break;
            }
        }
        // Validação dos dias (selects já são limitados, mas isNaN checa se algo deu muito errado)
        if (isNaN(newSchedule.openDay) || isNaN(newSchedule.closeDay)) isValid = false;


        if (!isValid) {
            setTimeout(() => { if (scheduleSaveStatusElement) { scheduleSaveStatusElement.textContent = ''; scheduleSaveStatusElement.classList.remove('visible', 'error'); } }, 4000);
            return;
        }

        // Lógica de validação mais complexa (opcional):
        // Ex: Dia/hora de fechamento deve ser após dia/hora de abertura (considerando a semana)
        // Por simplicidade, não incluído aqui, mas seria uma boa adição.

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
            // O listener em fetchScheduleSettings já vai atualizar currentScheduleConfig
            // e repopular o formulário, além de chamar updateListAvailabilityUI.
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


// Adiciona listener para o campo de busca de admin
if (adminSearchUserInput) {
    adminSearchUserInput.addEventListener('input', (e) => {
        if (isCurrentUserAdmin) {
            filterAndRenderAdminUserList(e.target.value);
        }
    });
}

// --- Chamada Inicial para carregar configurações de horário ---
fetchScheduleSettings();