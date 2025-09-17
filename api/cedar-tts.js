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
    const { message, call } = req.body;
    const text = message?.content || message?.text || req.body.text;

    if (!text) {
      console.log('Corps de requête reçu:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ 
        error: 'Texte manquant',
        received: req.body 
      });
    }

    console.log(`Génération TTS Cedar pour: "${text.substring(0, 100)}..."`);

    // Appel à l'API OpenAI TTS
    const openaiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd', // ou 'tts-1' pour plus rapide
        input: text,
        voice: 'cedar',
        response_format: 'mp3',
        speed: 1.0
      })
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('Erreur OpenAI TTS:', error);
      return res.status(500).json({ 
        error: 'Erreur OpenAI TTS',
        details: error 
      });
    }

    // Convertir la réponse en base64
    const audioBuffer = await openaiResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${audioBase64}`;

    // Réponse pour Vapi
    return res.status(200).json({
      success: true,
      audioUrl: audioUrl,
      message: `Audio Cedar généré avec succès (${text.length} caractères)`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur dans cedar-tts:', error);
    return res.status(500).json({
      error: 'Erreur serveur interne',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
