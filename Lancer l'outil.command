#!/bin/bash
# Double-cliquer ce fichier pour ouvrir l'outil dans le navigateur.
# Laisser la fenêtre Terminal ouverte pendant l'utilisation ; la fermer arrête l'outil.
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"
if [ ! -f out/index.html ]; then
  echo "Première ouverture : construction de l'outil (1 à 2 minutes)…"
  npm run build || { echo "La construction a échoué."; read -r; exit 1; }
fi
PORT=4173
( sleep 1; open "http://localhost:$PORT/" ) &
echo "Outil disponible sur http://localhost:$PORT/ — fermer cette fenêtre pour l'arrêter."
cd out && python3 -m http.server "$PORT"
