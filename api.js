const express = require('express');
const bodyParser = require('body-parser');
const { authenticatePronoteQRCode } = require("pawnote");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.get('/cc', async (req, res) => {
    const { jeton, login, url } = req.query;

    // Parameter validation
    if (!jeton || !login || !url) {
        const missingParams = [
            !jeton ? "jeton" : null,
            !login ? "login" : null,
            !url ? "url" : null
        ].filter(Boolean).join(", ");
        return res.status(400).json({ error: "Missing required parameters", missing: missingParams });
    }

    try {
        // Log authentication attempt
        console.log('Attempting to authenticate with QR code data');
        const client = await authenticatePronoteQRCode({
            pinCode: "0000", // Assuming pinCode is static or managed elsewhere
            dataFromQRCode: { jeton, login, url },
            deviceUUID: "my-device-uuid" // Assuming a static UUID or managed elsewhere
        });

        console.log('Authentication successful');

        // Fetch periods and process evaluations
        console.log('Fetching periods');
        const periods = await client.periods;
        if (periods.length === 0) {
            console.log('No periods available');
            return res.status(404).json({ message: "No periods found" });
        }

        const baremePoints = {
            "Très bonne maîtrise": 50,
            "Maîtrise satisfaisante": 40,
            "Presque maîtrisé": 40,
            "Maîtrise fragile": 25,
            "Début de maîtrise": 10,
            "Maîtrise insuffisante": 10,
          };

        const pointsByPrefix = {};
        const countByPrefix = {};

        console.log('Processing periods');
        for (const period of periods) {
            console.log(`Processing evaluations for period: ${period.name}`);
            const evaluations = await client.getEvaluations(period);

            evaluations.forEach((evaluation) => {
                evaluation.skills.forEach((skill) => {
                    if (skill.pillar && skill.pillar.prefixes) {
                        skill.pillar.prefixes.forEach((prefix) => {
                            if (prefix !== "") {
                                const points = (baremePoints[skill.level] || 0) * skill.coefficient;

                                if (!pointsByPrefix[prefix]) {
                                    pointsByPrefix[prefix] = points;
                                    countByPrefix[prefix] = 1;
                                } else {
                                    pointsByPrefix[prefix] += points;
                                    countByPrefix[prefix] += 1;
                                }
                            }
                        });
                    }
                });
            });
        }

        console.log('Calculating averages');
        const averagePointsByPrefix = {};
        let totalAveragePoints = 0;

        Object.keys(pointsByPrefix).forEach(prefix => {
            const average = pointsByPrefix[prefix] / countByPrefix[prefix];
            averagePointsByPrefix[prefix] = Math.round(average / 10) * 10;
            totalAveragePoints += averagePointsByPrefix[prefix];
        });

        // Return the calculated results
        res.json({
            totalAveragePoints,
            averagePointsByPrefix,
            details: { pointsByPrefix, countByPrefix }
        });

    } catch (error) {
        console.error('Error during processing:', error);
        res.status(500).json({ error: "Failed to process the request", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
