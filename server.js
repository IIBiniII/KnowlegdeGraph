const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());

// Rendre tes fichiers statiques (index.html, app.js, style.css) accessibles
app.use(express.static(__dirname));

const cheminFichier = path.join(__dirname, 'mindmap.json');

// Route pour charger les données
app.get('/api/donnees', (req, res) => {
    if (fs.existsSync(cheminFichier)) {
        try {
            const contenu = fs.readFileSync(cheminFichier, 'utf-8');
            // Si le fichier est vide ou corrompu, on envoie un tableau vide
            res.slice = contenu.trim() ? res.send(contenu) : res.json([]);
        } catch (e) {
            res.json([]);
        }
    } else {
        res.json([]); 
    }
});

// Route pour sauvegarder les données
app.post('/api/sauvegarder', (req, res) => {
    try {
        const donneesGraphe = req.body;
        
        if (!donneesGraphe) {
            return res.status(400).send("Données absentes.");
        }

        // Calcul dynamique du nombre d'éléments pour le log (gère Tableaux et Objets)
        let nbrElements = 0;
        if (Array.isArray(donneesGraphe)) {
            nbrElements = donneesGraphe.length;
        } else if (donneesGraphe.elements) {
            const nodesCount = donneesGraphe.elements.nodes ? donneesGraphe.elements.nodes.length : 0;
            const edgesCount = donneesGraphe.elements.edges ? donneesGraphe.elements.edges.length : 0;
            nbrElements = nodesCount + edgesCount;
        }

        // Écriture physique sur le disque
        fs.writeFileSync(cheminFichier, JSON.stringify(donneesGraphe, null, 2), 'utf-8');
        
        console.log(`💾 Synchro : ${nbrElements} éléments sauvegardés dans mindmap.json`);
        res.sendStatus(200);
    } catch (error) {
        console.error("Erreur écriture fichier :", error);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});