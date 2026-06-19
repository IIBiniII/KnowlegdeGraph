// ==========================================
// 1. STATE MANAGER (ÉTAT GLOBAL DE L'APP)
// ==========================================
// const AppState = {
//     settings: {
//         mode: 'local',
//         localUrl: 'http://localhost:1234/v1/chat/completions',
//         localModel: 'meta-llama-3.1-8b-instruct',
//         cloudKey: '',
//         quotaMax: 50000,
//         tokensUtilises: 0
//     },
//     selectedNodeId: null,
//     currentQuizData: null,
//     intention: {
//         domaine: "",
//         objectif: "decouvrir",
//         pointsCles: ""
//     },
// };


/**
 * Envoie l'intégralité de la MindMap au serveur web pour écriture dans un fichier JSON en dur
 */
async function sauvegarderGrapheEnDur() {
    if (!cy) return;
    
    let elementsGraphe = cy.elements().jsons();

    if (!Array.isArray(elementsGraphe)) {
        elementsGraphe = [elementsGraphe];
    }
    
    try {
        const response = await fetch('/api/sauvegarder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(elementsGraphe) 
        });
        if (!response.ok) throw new Error(`Erreur serveur : ${response.status}`);
        console.log("💾 Graphe envoyé au serveur.");
    } catch (error) {
        console.error("❌ Échec de la sauvegarde :", error);
    }
}


// =========================================================================
// 1. MOTEUR GLOBAL DE FILE D'ATTENTE IA (ASYNCHRONE ET NON BLOQUANT)
// =========================================================================
const IAQueueManager = {
    queue: [],
    isProcessing: false,

    /**
     * Ajoute une requête dans la file d'attente d'arrière-plan
     * @param {string} promptSystem - Les directives de rôle
     * @param {string} promptUser - La donnée brute saisie
     * @param {function} callbackSucces - Action à réaliser au retour du JSON
     */
    ajouterTache(promptSystem, promptUser, callbackSucces) {
        this.queue.push({ promptSystem, promptUser, callbackSucces });
        this.mettreAJourInterface();
        this.traiterSuivant();
    },

    async traiterSuivant() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        this.mettreAJourInterface();

        const tacheEnCours = this.queue[0]; // On récupère sans enlever de la pile immédiatement

        try {
            const url = AppState.settings.mode === 'local' ? AppState.settings.localUrl : "https://api.openai.com/v1/chat/completions";
            const headers = { "Content-Type": "application/json" };
            if (AppState.settings.mode === 'cloud') {
                headers["Authorization"] = `Bearer ${AppState.settings.cloudKey}`;
            }

            const bodyConfig = {
                model: AppState.settings.mode === 'local' ? AppState.settings.localModel : "gpt-4o-mini",
                messages: [
                    { role: "system", content: tacheEnCours.promptSystem },
                    { role: "user", content: tacheEnCours.promptUser }
                ],
                temperature: 0.3
            };

            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(bodyConfig)
            });

            if (!response.ok) throw new Error(`Réponse serveur invalide: ${response.status}`);
            
            const resData = await response.json();
            
            // Extraction universelle (Ollama format natif chat ou OpenAI classique)
            let texteBrut = "";
            if (resData.choices && resData.choices[0]) {
                texteBrut = resData.choices[0].message.content;
            } else if (resData.message) {
                texteBrut = resData.message.content;
            } else if (resData.response) {
                texteBrut = resData.response; // fallback Ollama standard endpoint non-chat
            }

            // Nettoyage et parse JSON sécurisé
            texteBrut = texteBrut.replace(/```json/g, "").replace(/```/g, "").trim();
            const donneesParsees = JSON.parse(texteBrut);
            
            // Exécution du callback graphique ou logique
            tacheEnCours.callbackSucces(donneesParsees);

        } catch (error) {
            console.error("❌ Échec du traitement d'une tâche de la file d'attente IA :", error);
            alert("Une tâche IA en arrière-plan a échoué. Le graphe n'a pas pu être mis à jour.");
        } finally {
            this.queue.shift(); // Supprime la tâche terminée avec succès ou échec
            this.isProcessing = false;
            this.mettreAJourInterface();
            this.traiterSuivant(); // Lance la tâche suivante dans la pile
        }
    },

    mettreAJourInterface() {
        const countEl = document.getElementById('queue-count');
        const spinnerEl = document.getElementById('queue-spinner');
        if (countEl && spinnerEl) {
            countEl.innerText = this.queue.length;
            spinnerEl.style.display = this.isProcessing ? 'block' : 'none';
        }
    }
};

// =========================================================================
// 2. ÉTAT DU SYSTÈME GLOBAL ET SAUVEGARDE
// =========================================================================
const AppState = {
    settings: {
        mode: 'local',
        localUrl: 'http://localhost:1234/v1/chat/completions',
        localModel: 'meta-llama-3.1-8b-instruct',
        cloudKey: '',
        quotaMax: 50000
    },
    vueActuelle: 'user', // 'user' ou 'spec' ou 'settings'
    noeudSelectionneId: null,
    motsConnusMasques: false
};

// =========================================================================
// 3. INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    chargerConfiguration();
    initChangementVues();
    initComportementsInterface();
    initCytoscape();
    initEvenementsModale();
});

function initEvenementsModale() {
    const modal = document.getElementById('evaluation-modal');
    const closeBtn = document.getElementById('close-modal');

    if (closeBtn && modal) {
        // Fermeture au clic sur la croix
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Fermeture si l'utilisateur clique en dehors de la boîte blanche
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

function initChangementVues() {
    const btnUser = document.getElementById('btn-view-user');
    const btnSpec = document.getElementById('btn-view-spec');
    const btnSettings = document.getElementById('btn-view-settings');

    btnUser.addEventListener('click', () => basculerVue('user', btnUser));
    btnSpec.addEventListener('click', () => basculerVue('spec', btnSpec));
    btnSettings.addEventListener('click', () => basculerVue('settings', btnSettings));
}

function basculerVue(nomVue, boutonClique) {
    AppState.vueActuelle = nomVue;

    // Gestion des panneaux d'onglets
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${nomVue}-view`).classList.add('active');

    // Gestion de la surbrillance du bouton
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    boutonClique.classList.add('active');

    // PRIVILÈGE SPÉCIFICATEUR : Permettre le drag & drop ou verrouiller les nœuds
    if (cy) {
        if (nomVue === 'spec') {
            cy.autoungrabify(false); // Autorise le déplacement
            cy.nodes().addClass('editable');
        } else {
            cy.autoungrabify(true);  // Bloque les positions pour l'utilisateur lambda
            cy.nodes().removeClass('editable');
            AppState.noeudSelectionneId = null;
            mettreAJourControlesSpec();
        }
        setTimeout(() => cy.resize(), 50);
    }
}

// =========================================================================
// 4. CONFIGURATION ET CAPTURE DES PARAMÈTRES
// =========================================================================
function initComportementsInterface() {
    const modeSelect = document.getElementById('ia-mode');
    const localPanel = document.getElementById('local-settings');
    const cloudPanel = document.getElementById('cloud-settings');

    modeSelect.addEventListener('change', (e) => {
        AppState.settings.mode = e.target.value;
        if (AppState.settings.mode === 'local') {
            localPanel.style.display = 'block'; cloudPanel.style.display = 'none';
        } else {
            localPanel.style.display = 'none'; cloudPanel.style.display = 'block';
        }
        sauvegarderConfiguration();
    });

    ['local-url', 'local-model', 'cloud-key', 'cloud-quota'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const clefConfig = id.replace('local-', 'local').replace('cloud-', 'cloud');
            AppState.settings[clefConfig] = e.target.value;
            sauvegarderConfiguration();
        });
    });

    document.getElementById('btn-clear-data').addEventListener('click', () => {
        if (confirm("Voulez-vous réinitialiser entièrement la mindmap ?")) {
            localStorage.removeItem('mindmap_elements');
            window.location.reload();
        }
    });

    // ÉCOUTEURS VUE UTILISATEUR
    document.getElementById('btn-submit-note').addEventListener('click', traiterNoteApprentissageUtilisateur);
    document.getElementById('btn-submit-vocab').addEventListener('click', traiterAjoutVocabulaireDirect);
    document.getElementById('action-evaluate')?.addEventListener('click', lancerRevisionNoeud);
    document.getElementById('btn-start-quiz-vocab')?.addEventListener('click', lancerRevisionNoeud);
    document.getElementById('vocab-csv-file').addEventListener('change', traiterImportCSVVocabulaire);
    document.getElementById('btn-toggle-connus').addEventListener('click', basculerVisibiliteMotsConnus);
    

    // ÉCOUTEURS VUE SPÉCIFICATEUR
    document.getElementById('btn-spec-delete').addEventListener('click', executerSuppressionNoeudSpec);
    document.getElementById('btn-spec-add-root').addEventListener('click', () => executerAjoutManuelSpec(true));
    document.getElementById('btn-spec-add-child').addEventListener('click', () => executerAjoutManuelSpec(false));
}

function sauvegarderConfiguration() {
    localStorage.setItem('ia_settings', JSON.stringify(AppState.settings));
}

function chargerConfiguration() {
    const raw = localStorage.getItem('ia_settings');
    if (raw) {
        AppState.settings = JSON.parse(raw);
        document.getElementById('ia-mode').value = AppState.settings.mode;
        document.getElementById('local-url').value = AppState.settings.localUrl;
        document.getElementById('local-model').value = AppState.settings.localModel;
        document.getElementById('cloud-key').value = AppState.settings.cloudKey;
        document.getElementById('cloud-quota').value = AppState.settings.cloudQuota;
        
        if (AppState.settings.mode === 'cloud') {
            document.getElementById('local-settings').style.display = 'none';
            document.getElementById('cloud-settings').style.display = 'block';
        }
    }
}

// =========================================================================
// 5. MOTEUR ET LOGIQUE DU GRAPHE CYTOSCAPE
// =========================================================================
/**
 * Initialise Cytoscape en récupérant d'abord le fichier JSON sur le serveur
 */
async function initCytoscape() {
    // Structure par défaut si le fichier JSON du serveur est vide ou indisponible
    let elementsInitiaux = [
        { data: { id: 'root_general', label: 'Connaissances Générales', type: 'concept' } }
    ];
    let estPreset = false;

    try {
        // Requête vers le serveur pour lire le fichier JSON
        const response = await fetch('/api/donnees'); 
        if (response.ok) {
            const donneesServeur = await response.json();
            // On vérifie que le fichier contient bien des données valides
            if (donneesServeur && donneesServeur.length > 0) {
                elementsInitiaux = donneesServeur;
                estPreset = true; // Permet de figer la position des nœuds
                console.log("📖 Données chargées avec succès depuis le fichier JSON du serveur.");  
            }
        }
    } catch (e) {
        console.warn("Fichier JSON introuvable ou vide sur le serveur. Chargement de la racine par défaut.", e);
    }

    // Initialisation de Cytoscape
    cy = cytoscape({
        container: document.getElementById('cy-container'),
        elements: elementsInitiaux,
        autoungrabify: true, 
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#34495e', 'label': 'data(label)',
                    'color': '#2c3e50', 'font-size': '12px', 'text-valign': 'center',
                    'text-halign': 'right', 'width': '35px', 'height': '35px',
                    'text-margin-x': '8px', 'font-weight': 'bold'
                }
            },
            {
                selector: 'node[type="vocab"]',
                style: { 'background-color': '#f1c40f', 'shape': 'rectangle', 'width': '25px', 'height': '25px' }
            },
            {
                selector: 'node.editable',
                style: { 'border-width': '2px', 'border-color': '#e67e22' }
            },
            {
                selector: 'node:selected',
                style: { 'background-color': '#e74c3c', 'border-width': '3px', 'border-color': '#2c3e50' }
            },
            {
                selector: 'edge',
                style: { 'width': 2, 'line-color': '#cbd5e0', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#cbd5e0', 'curve-style': 'bezier' }
            },
            {
                selector: 'node[statut="connu"]',
                style: {
                    'background-color': '#2ecc71', 
                    'border-width': '2px',
                    'border-color': '#27ae60',     
                    'opacity': 0.85                
                }
            },
            {
                selector: 'edge[statut="connu"]', 
                style: {
                    'display': 'none'
                }
            }
        ],
        layout: estPreset ? { name: 'preset' } : { name: 'cose', animate: false }
    });

    // Écouteurs de clics
    cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        AppState.noeudSelectionneId = node.id();
        if (AppState.vueActuelle === 'spec') mettreAJourControlesSpec();
    });

    cy.on('tap', (evt) => {
        if (evt.target === cy) {
            AppState.noeudSelectionneId = null;
            if (AppState.vueActuelle === 'spec') mettreAJourControlesSpec();
        }
    });

    // Sauvegarde automatique dès qu'un élément est relâché par le spécificateur
    cy.on('free', 'node', () => {
        if (AppState.vueActuelle === 'spec') sauvegarderGrapheEnDur();
    });
}

function sauvegarderGraphe() {
    sauvegarderGrapheEnDur();
    // if (!cy) return;
    // localStorage.setItem('mindmap_elements', JSON.stringify(cy.elements().json()));
}

function redessinerGraphe() {
    if (!cy) return;

    // 1. Déclaration et configuration de la mise en page
    const layoutGraphe = cy.layout({ 
        name: 'cose', 
        animate: true, 
        animationDuration: 400 
    });

    // 2. On attache l'écouteur d'événement sur cette instance précise
    layoutGraphe.one('layoutstop', () => {
        console.log("🔄 Animation de mise en page terminée. Lancement de la sauvegarde...");
        sauvegarderGrapheEnDur(); 
    });

    // 3. On lance l'exécution de la mise en page
    layoutGraphe.run();

    if (AppState.motsConnusMasques) {
        cy.nodes('[statut="connu"]').style('display', 'none');
        cy.nodes('[statut="connu"]').connectedEdges().style('display', 'none');
    }
}

// =========================================================================
// 6. ACTIONS LOGIQUES DE LA VUE UTILISATEUR
// =========================================================================
function traiterNoteApprentissageUtilisateur() {
    const textarea = document.getElementById('user-note-input');
    const noteRaw = textarea.value.trim();
    if (!noteRaw) return alert("Veuillez formuler vos connaissances.");

    textarea.value = ""; // Effacement immédiat pour garder l'interface fluide

    // Extraction de la liste des concepts existants pour que l'IA puisse s'y greffer
    const categoriesExistantes = cy.nodes('[type="concept"]').map(n => ({ id: n.id(), label: n.data('label') }));

    const promptSystem = `Tu es une IA intégratrice de connaissances complexes. Ton rôle est d'analyser la phrase de l'apprenant pour en extraire une structure segmentée et hiérarchique sous forme de MindMap (un tableau de nœuds et de liens).
Tu dois découper la pensée en concepts principaux, sous-concepts, définitions ou formules associées si nécessaire (Ex: Loi d'Ohm -> Formule -> U = R x I).

Règles de rattachement :
1. Analyse si le point de départ de cette nouvelle structure peut se brancher sur une catégorie existante fournie. Si oui, indique son ID comme "id_parent_global".
2. Si la note n'a aucun rapport avec les concepts existants, laisse "id_parent_global" à null.

Tu dois impérativement renvoyer UNIQUEMENT un JSON brut respectant exactement cette structure :
{
  "id_parent_global": "id_de_la_categorie_existante_ou_null",
  "nodes": [
    { "id": "id_local_1", "label": "Concept Principal extrait (ex: Loi d'Ohm)" },
    { "id": "id_local_2", "label": "Sous-concept ou type (ex: Formule)" },
    { "id": "id_local_3", "label": "Donnée brute, formule ou détail (ex: U = R x I)" }
  ],
  "edges": [
    { "source": "id_local_1", "target": "id_local_2" },
    { "source": "id_local_2", "target": "id_local_3" }
  ]
}
Attention : Utilise des identifiants temporaires textuels simples pour "id_local" (ex: "n1", "n2").`;

    const promptUser = `Phrase de l'utilisateur : "${noteRaw}"\nConcepts existants actuellement dans le graphe : ${JSON.stringify(categoriesExistantes)}`;

    // Envoi à notre gestionnaire de file d'attente d'arrière-plan
    IAQueueManager.ajouterTache(promptSystem, promptUser, (jsonReponse) => {
        if (!jsonReponse.nodes || jsonReponse.nodes.length === 0) return;

        // Dictionnaire pour mapper les ID locaux de l'IA avec des ID uniques réels basés sur le Timestamp
        const mapIds = {};
        let premierIdReel = null;

        // 1. Insertion des nœuds segmentés par l'IA
        jsonReponse.nodes.forEach((noeudIA, index) => {
            const idReel = `concept_${Date.now()}_${index}`;
            mapIds[noeudIA.id] = idReel;

            if (index === 0) premierIdReel = idReel; // Le nœud tête de la nouvelle mini-structure

            cy.add({
                group: 'nodes',
                data: { id: idReel, label: noeudIA.label, type: 'concept' }
            });
        });

        // 2. Rattachement de la nouvelle structure au reste du graphe
        if (jsonReponse.id_parent_global) {
            // On vérifie si le parent suggéré existe toujours dans Cytoscape
            const parentExiste = cy.getElementById(jsonReponse.id_parent_global).length > 0;
            const idParentFinal = parentExiste ? jsonReponse.id_parent_global : 'root_general';
            
            cy.add({
                group: 'edges',
                data: { id: `edge_root_${Date.now()}`, source: idParentFinal, target: premierIdReel }
            });
        } else {
            // Si aucun rapport, on le branche automatiquement sur la racine générale pour éviter l'isolement
            cy.add({
                group: 'edges',
                data: { id: `edge_root_${Date.now()}`, source: 'root_general', target: premierIdReel }
            });
        }

        // 3. Insertion des liens internes segmentés par l'IA
        if (jsonReponse.edges && jsonReponse.edges.length > 0) {
            jsonReponse.edges.forEach((lienIA, index) => {
                const sourceReelle = mapIds[lienIA.source];
                const targetReelle = mapIds[lienIA.target];

                // On s'assure que les deux nœuds existent bien dans notre dictionnaire avant de lier
                if (sourceReelle && targetReelle) {
                    cy.add({
                        group: 'edges',
                        data: { id: `edge_internal_${Date.now()}_${index}`, source: sourceReelle, target: targetReelle }
                    });
                }
            });
        }

        // Réorganisation visuelle fluide et sauvegarde locale
        redessinerGraphe();
    });

    alert("Votre note est en cours de segmentation par l'IA. Elle apparaîtra sous forme d'arborescence dans quelques instants !");
}

function traiterAjoutVocabulaireDirect() {
    const inputLang = document.getElementById('vocab-lang');
    const inputTerme = document.getElementById('vocab-terme');
    const inputDef = document.getElementById('vocab-def');

    const lang = inputLang.value.trim();
    const terme = inputTerme.value.trim();
    const def = inputDef.value.trim();

    if (!lang || !terme || !def) return alert("Veuillez remplir tous les champs de vocabulaire.");

    let idLangNode = `lang_${lang.toLowerCase().replace(/\s/g, '')}`;
    const noeudLangExiste = cy.getElementById(idLangNode).length > 0;

    // 1. Si la langue n'existe pas, on l'ajoute à l'instance globale
    if (!noeudLangExiste) {
        cy.add([
            { group: 'nodes', data: { id: idLangNode, label: `Vocabulaire : ${lang}`, type: 'concept' } },
            { group: 'edges', data: { id: `e_lang_${Date.now()}`, source: 'root_general', target: idLangNode } }
        ]);
    }

    // 2. On ajoute le mot de vocabulaire lié à cette langue
    const idVocab = `vocab_${Date.now()}`;
    cy.add([
        { group: 'nodes', data: { id: idVocab, label: `${terme} : ${def}`, type: 'vocab',statut: 'a_reviser' } },
        { group: 'edges', data: { id: `e_voc_${Date.now()}`, source: idLangNode, target: idVocab } }
    ]);

    // 3. Reset des champs et réorganisation (qui va déclencher la sauvegarde complète)
    inputTerme.value = ""; 
    inputDef.value = "";
    
    redessinerGraphe();
}

// =========================================================================
// 7. ACTIONS LOGIQUES DE LA VUE SPÉCIFICATEUR
// =========================================================================
function mettreAJourControlesSpec() {
    const labelSelection = document.getElementById('spec-selected-label');
    const btnDelete = document.getElementById('btn-spec-delete');
    const btnAddChild = document.getElementById('btn-spec-add-child');

    if (AppState.noeudSelectionneId) {
        const node = cy.getElementById(AppState.noeudSelectionneId);
        labelSelection.innerText = node.data('label');
        btnDelete.disabled = false;
        btnAddChild.disabled = false;
    } else {
        labelSelection.innerText = "Aucun";
        btnDelete.disabled = true;
        btnAddChild.disabled = true;
    }
}

function executerSuppressionNoeudSpec() {
    if (!AppState.noeudSelectionneId) return;
    if (AppState.noeudSelectionneId === 'root_general') return alert("Impossible de supprimer la racine globale.");
    
    cy.getElementById(AppState.noeudSelectionneId).remove();
    AppState.noeudSelectionneId = null;
    mettreAJourControlesSpec();
    redessinerGraphe();
}

function executerAjoutManuelSpec(creerRacine) {
    const input = document.getElementById('spec-node-label');
    const texte = input.value.trim();
    if (!texte) return alert("Veuillez donner un nom au nœud.");

    const nouvelId = `manual_${Date.now()}`;
    cy.add({
        group: 'nodes',
        data: { id: nouvelId, label: texte, type: 'concept' },
        classes: 'editable'
    });

    if (!creerRacine && AppState.noeudSelectionneId) {
        cy.add({ group: 'edges', data: { id: `e_m_${Date.now()}`, source: AppState.noeudSelectionneId, target: nouvelId } });
    }

    input.value = "";
    redessinerGraphe();
}


// QUIZZ PART

/**
 * Lance une session de révision en série sur un tableau de nœuds mots
 */
function lancerSessionVocabulaireGlobale(listeNoeudsMots, nomLangue) {
    const modal = document.getElementById('evaluation-modal');
    const body = document.getElementById('modal-body');
    const footer = document.getElementById('modal-footer');
    
    document.getElementById('modal-title').innerText = `Session : ${nomLangue}`;
    modal.style.display = 'flex';

    let indexActuel = 0;
    let reponsesJustes = 0;

    function afficherMotCourant() {
        if (indexActuel >= listeNoeudsMots.length) {
            // Fin de la session -> Affichage du score
            const pourcentage = Math.round((reponsesJustes / listeNoeudsMots.length) * 100);
            body.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <h2 style="color: #34495e; margin-bottom: 10px;">Session terminée ! 🎉</h2>
                    <p style="font-size: 1.1rem;">Score : <strong>${reponsesJustes} / ${listeNoeudsMots.length}</strong> mots maîtrisés.</p>
                    <h1 style="color: ${pourcentage >= 70 ? '#2ecc71' : '#e74c3c'}; font-size: 3.5rem; margin: 20px 0;">${pourcentage}%</h1>
                </div>
            `;
            footer.innerHTML = `<button class="btn-action primary" style="width: 100%;" onclick="document.getElementById('evaluation-modal').style.display='none'">Fermer la session</button>`;
            return;
        }

        const noeudCourant = listeNoeudsMots[indexActuel];
        const [terme, ...reste] = noeudCourant.data('label').split(' : ');
        const definition = reste.join(' : ');

        body.innerHTML = `
            <div style="text-align: center; padding: 15px;">
                <p style="font-size: 0.8rem; color: #95a5a6; margin: 0;">Progression : ${indexActuel + 1} / ${listeNoeudsMots.length}</p>
                <p style="font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase; letter-spacing: 1px; margin: 15px 0 5px 0;">Restituez la traduction de :</p>
                <h2 style="color: #2c3e50; font-size: 2rem; margin: 0 0 25px 0;">${terme}</h2>
                
                <div id="serie-verso" style="display: none; background: #fdfaf0; padding: 15px; border-radius: 6px; border: 2px dashed #f1c40f;">
                    <h3 style="color: #27ae60; font-size: 1.4rem; margin: 0;">${definition}</h3>
                </div>
            </div>
        `;

        footer.innerHTML = `
            <button id="btn-serie-reveal" class="btn-action primary" style="width: 100%;">👁️ Vérifier</button>
            <div id="serie-actions" style="display: none; gap: 10px; width: 100%;">
                <button id="btn-serie-wrong" class="btn-action danger" style="flex: 1;">❌ Échec</button>
                <button id="btn-serie-right" class="btn-action success" style="flex: 1;">✅ Correct</button>
            </div>
        `;

        document.getElementById('btn-serie-reveal').addEventListener('click', () => {
            document.getElementById('serie-verso').style.display = 'block';
            document.getElementById('btn-serie-reveal').style.display = 'none';
            document.getElementById('serie-actions').style.display = 'flex';
        });

        document.getElementById('btn-serie-wrong').addEventListener('click', () => {
            noeudCourant.data('statut', 'a_reviser'); // Échec
            noeudCourant.style('background-color', '#e74c3c');
            indexActuel++;
            sauvegarderGrapheEnDur();
            afficherMotCourant();
        });

        document.getElementById('btn-serie-right').addEventListener('click', () => {
            noeudCourant.data('statut', 'connu'); // <-- SUCCÈS !
            noeudCourant.style('background-color', '#2ecc71');
            reponsesJustes++;
            indexActuel++;
            sauvegarderGrapheEnDur();
            afficherMotCourant();
        });
    }

    // Lance le premier mot
    afficherMotCourant();
}

/**
 * Ouvre une flashcard unique pour un mot
 */
function lancerFlashcardLocal(node) {
    const modal = document.getElementById('evaluation-modal');
    const body = document.getElementById('modal-body');
    const footer = document.getElementById('modal-footer');
    
    // Extraction du terme et de la définition depuis le label "Terme : Définition"
    const labelComplet = node.data('label');
    const [terme, ...reste] = labelComplet.split(' : ');
    const definition = reste.join(' : '); // Au cas où la définition contient des colons

    document.getElementById('modal-title').innerText = `Flashcard Étrangère`;
    modal.style.display = 'flex';

    // Affichage du Recto (le mot à deviner)
    body.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <p style="font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase; letter-spacing: 1px; margin:0;">Mot à traduire</p>
            <h2 style="color: #2c3e50; font-size: 2.2rem; margin: 15px 0 30px 0;">${terme}</h2>
            
            <div id="flashcard-verso" style="display: none; background: #fdfaf0; padding: 20px; border-radius: 6px; border: 2px dashed #f1c40f; margin-top: 20px;">
                <p style="font-size: 0.8rem; color: #7f8c8d; margin: 0; text-transform: uppercase;">Traduction / Sens</p>
                <h3 style="color: #27ae60; font-size: 1.6rem; margin: 10px 0 0 0;">${definition}</h3>
            </div>
        </div>
    `;

    // Pied de page avec boutons dynamiques
    footer.innerHTML = `
        <button id="btn-reveal-card" class="btn-action primary" style="width: 100%;">👁️ Révéler la réponse</button>
        <div id="flashcard-actions" style="display: none; gap: 10px; width: 100%;">
            <button id="btn-card-wrong" class="btn-action danger" style="flex: 1;">❌ À revoir (Échec)</button>
            <button id="btn-card-right" class="btn-action success" style="flex: 1;">✅ Connu (Succès)</button>
        </div>
    `;

    // Événement pour retourner la carte
    document.getElementById('btn-reveal-card').addEventListener('click', () => {
        document.getElementById('flashcard-verso').style.display = 'block';
        document.getElementById('btn-reveal-card').style.display = 'none';
        document.getElementById('flashcard-actions').style.display = 'flex';
    });

    // Événement Succès (Bouton Vert)
    document.getElementById('btn-card-right').addEventListener('click', () => {
        node.data('statut', 'connu'); // <-- Change le statut en dur dans Cytoscape
        node.style('background-color', '#2ecc71'); // Optionnel : garde la couleur verte si affiché
        modal.style.display = 'none';
        
        sauvegarderGrapheEnDur(); // Sauvegarde instantanée dans le fichier JSON
    });

    // Événement Échec (Bouton Rouge)
    document.getElementById('btn-card-wrong').addEventListener('click', () => {
        node.data('statut', 'a_reviser'); // Reste ou repasse à réviser
        node.style('background-color', '#e74c3c');
        modal.style.display = 'none';
        
        sauvegarderGrapheEnDur();
    });
}


/**
 * Lance le quiz approprié selon le type de nœud sélectionné
 */
function lancerRevisionNoeud() {
    if (!AppState.noeudSelectionneId) return alert("Veuillez sélectionner un nœud à réviser.");

    const node = cy.getElementById(AppState.noeudSelectionneId);
    const type = node.data('type');

    if (type === 'vocab') {
        // Mode Flashcard unique pour un mot précis
        lancerFlashcardLocal(node);
    } else if (node.data('label') && node.data('label').startsWith('Vocabulaire :')) {
        // Mode Session globale : réviser TOUS les mots de cette langue
        const motsDeLaLangue = node.neighborhood('node[type="vocab"]').filter(n => n.data('statut') !== 'connu');
        if (motsDeLaLangue.length === 0) return alert("Aucun mot à réviser dans cette langue.");
        
        lancerSessionVocabulaireGlobale(motsDeLaLangue.toArray(), node.data('label'));
    } else {
        alert("Pour le moment, seules les flashcards de vocabulaire sont prêtes pour la révision.");
    }
}


/**
 * Lit un fichier CSV fourni par l'utilisateur et l'intègre en masse dans le graphe
 */
function traiterImportCSVVocabulaire(evenement) {
    const inputLang = document.getElementById('vocab-lang');
    const langue = inputLang.value.trim();

    // 1. Validation de sécurité
    if (!langue) {
        alert("Veuillez d'abord saisir la Langue cible dans le champ ci-dessus avant de choisir le fichier CSV.");
        evenement.target.value = ""; // Reset du fichier choisi
        return;
    }

    const fichier = evenement.target.files[0];
    if (!fichier) return;

    const lecteur = new FileReader();
    
    lecteur.onload = function(e) {
        const texteBrut = e.target.result;
        // Découpage par ligne (gère les retours à la ligne Windows et Unix)
        const lignes = texteBrut.split(/\r?\n/);
        
        // Préparation du nœud racine de la langue
        let idLangNode = `lang_${langue.toLowerCase().replace(/\s/g, '')}`;
        const noeudLangExiste = cy.getElementById(idLangNode).length > 0;
        
        const elementsAAjouter = [];

        if (!noeudLangExiste) {
            elementsAAjouter.push({ group: 'nodes', data: { id: idLangNode, label: `Vocabulaire : ${langue}`, type: 'concept' } });
            elementsAAjouter.push({ group: 'edges', data: { id: `e_lang_${Date.now()}`, source: 'root_general', target: idLangNode } });
        }

        let compteurMots = 0;

        // 2. Analyse de chaque ligne du CSV
        lignes.forEach((ligne, index) => {
            if (!ligne.trim()) return; // Ignore les lignes vides

            // Détection dynamique du séparateur (point-virgule ou virgule)
            const separateur = ligne.includes(';') ? ';' : ',';
            const colonnes = ligne.split(separateur);

            if (colonnes.length >= 2) {
                const terme = colonnes[0].trim();
                const definition = colonnes[1].trim();

                if (terme && definition) {
                    const idVocab = `vocab_${Date.now()}_csv_${index}`;
                    
                    // Ajout du nœud mot
                    elementsAAjouter.push({
                        group: 'nodes',
                        data: { id: idVocab, label: `${terme} : ${definition}`, type: 'vocab',statut: 'a_reviser' }
                    });
                    // Ajout du lien vers sa langue
                    elementsAAjouter.push({
                        group: 'edges',
                        data: { id: `e_voc_${Date.now()}_csv_${index}`, source: idLangNode, target: idVocab }
                    });
                    compteurMots++;
                }
            }
        });

        // 3. Injection globale et synchronisation en dur
        if (elementsAAjouter.length > 0) {
            cy.add(elementsAAjouter);
            redessinerGraphe(); // Rangement automatique et sauvegarde fichier JSON
            alert(`Succès ! ${compteurMots} flashcards ont été importées dans la catégorie [${langue}].`);
        } else {
            alert("Aucune donnée valide n'a pu être extraite. Vérifiez le format : Terme;Définition");
        }

        // Reset de l'input file pour permettre une nouvelle sélection future
        evenement.target.value = "";
    };

    lecteur.readAsText(fichier, 'UTF-8');
}

/**
 * Alterne l'affichage des nœuds de vocabulaire marqués comme "connu"
 */
function basculerVisibiliteMotsConnus() {
    const bouton = document.getElementById('btn-toggle-connus');
    
    // Inversion de l'état
    AppState.motsConnusMasques = !AppState.motsConnusMasques;

    if (AppState.motsConnusMasques) {
        // On cherche tous les nœuds ayant le statut 'connu' et on les cache
        // .style() applique un changement visuel immédiat en mémoire sans altérer le JSON en dur
        cy.nodes('[statut="connu"]').style('display', 'none');
        
        // Optionnel : on cache aussi les liens connectés à ces nœuds pour éviter les lignes orphelines
        cy.nodes('[statut="connu"]').connectedEdges().style('display', 'none');

        bouton.innerText = "👁️ Afficher les mots connus";
        bouton.style.backgroundColor = "#27ae60"; // Devient vert pour indiquer qu'on filtre
    } else {
        // On réaffiche tout le monde
        cy.nodes('[statut="connu"]').style('display', 'element');
        cy.nodes('[statut="connu"]').connectedEdges().style('display', 'element');

        bouton.innerText = "👁️ Masquer les mots connus";
        bouton.style.backgroundColor = "#34495e"; // Reprend sa couleur sombre
    }
}