export default async function handler(req, res) {
  // Configuration CORS pour Vapi
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Extraire le texte depuis Vapi
    const { message, call, voice } = req.body;
    const text = message?.content || message?.text || req.body.text;
    
    if (!text) {
      console.log('Corps de requête reçu:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ 
        error: 'Texte manquant',
        received: req.body 
      });
    }
    
    // Mapping des voix françaises Azure
    const voiceMap = {
      'denise': 'fr-FR-DeniseNeural',
      'henri': 'fr-FR-HenriNeural', 
      'vivienne': 'fr-FR-VivienneMultilingualNeural',
      'default': 'fr-FR-DeniseNeural'
    };
    
    const selectedVoice = voiceMap[voice] || voiceMap.default;
    
    console.log(`Génération TTS Azure pour: "${text.substring(0, 100)}..." avec voix: ${selectedVoice}`);
    
    // Vérification des variables d'environnement
    if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
      return res.status(500).json({ 
        error: 'Configuration Azure manquante',
        details: 'AZURE_SPEECH_KEY et AZURE_SPEECH_REGION requis'
      });
    }
    
    console.log('Région Azure:', process.env.AZURE_SPEECH_REGION);
    console.log('Clé Azure utilisée:', process.env.AZURE_SPEECH_KEY?.substring(0, 10) + '...');
    
    // 1. Obtenir un token d'accès
    const tokenResponse = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Erreur token Azure:', error);
      return res.status(500).json({ 
        error: 'Impossible d\'obtenir le token Azure',
        details: error 
      });
    }
    
    const accessToken = await tokenResponse.text();
    
    // 2. Créer le SSML pour la synthèse vocale
    const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">
  <voice name="${selectedVoice}">
    ${text}
  </voice>
</speak>`;
    
    console.log('SSML généré:', ssml);
    
    // 3. Appel à l'API Azure TTS
    const ttsResponse = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'vapi-azure-tts-proxy'
      },
      body: ssml
    });
    
    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      console.error('Erreur Azure TTS:', error);
      return res.status(500).json({ 
        error: 'Erreur Azure TTS',
        details: error,
        status: ttsResponse.status
      });
    }
    
    // 4. Convertir la réponse en base64
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
    
    console.log(`Audio généré avec succès - Taille: ${audioBuffer.byteLength} bytes`);
    
    // 5. Réponse pour Vapi
    return res.status(200).json({
      success: true,
      audioUrl: audioUrl,
      voice: selectedVoice,
      message: `Audio Azure généré avec succès (${text.length} caractères)`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur dans azure-tts:', error);
    return res.status(500).json({
      error: 'Erreur serveur interne',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}
