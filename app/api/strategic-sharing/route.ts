import { NextRequest } from 'next/server';
import { IsolatedAgent } from '@/lib/agents/IsolatedAgent';

/**
 * API endpoint for strategic sharing test - executes one step at a time.
 * Frontend calls this for each step, providing Finn's response.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { step, finnResponse, gameState: clientGameState } = body;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Store controller so human response endpoint can continue streaming
      setGameStreamController(controller);
      resetGameState();

      const sendUpdate = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const allDebugEvents: any[] = [];
        let lastDebugCount = 0; // Track how many debug events we've sent

        // Create four agents (3 LLMs + 1 human)
    const genji = new IsolatedAgent(
      'Genji',
      'You are Genji. Use all information available to you. Be clever and thorough in your answers.'
    );

    const hanzo = new IsolatedAgent(
      'Hanzo',
      'You are Hanzo. Use all information available to you. Be clever and thorough in your answers.'
    );

    const kendrick = new IsolatedAgent(
      'Kendrick',
      'You are Kendrick. Use all information available to you. Be clever and thorough in your answers.'
    );

    const agents = [
      { name: 'Finn', agent: null, isHuman: true }, // Finn is human
      { name: 'Genji', agent: genji, isHuman: false },
      { name: 'Hanzo', agent: hanzo, isHuman: false },
      { name: 'Kendrick', agent: kendrick, isHuman: false }
    ];

        allDebugEvents.push({
          type: 'ORCHESTRATOR_START',
          data: { message: 'Starting strategic sharing test with 4 agents (including Finn - human)' },
          timestamp: Date.now()
        });

        let newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Step 1: Each agent picks a number (parallel)
        allDebugEvents.push({
          type: 'STEP_1_START',
          data: { message: 'Asking all agents to pick a number from 1-10' },
          timestamp: Date.now()
        });

        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Send orchestrator messages FIRST
        agents.forEach(({ name }) => {
          const orchestratorMsg = {
            agent: name,
            from: 'Orchestrator',
            to: name,
            message: `Pick an integer from 1 to 10.`
          };
          sendUpdate({ type: 'message', message: orchestratorMsg });
        });

        // Get Finn's (human) response FIRST, before LLMs start thinking
        let finnResponse: string = '';
        for (const { name, isHuman } of agents) {
          if (isHuman) {
            sendUpdate({ type: 'waiting_for_human', agent: name });
            finnResponse = await waitForHumanResponse();
            break;
          }
        }

        // NOW get agent responses in parallel (LLMs only, Finn already responded)
        const pickResponses = await Promise.all(
          agents.map(async ({ agent, isHuman }) => {
            if (isHuman) {
              return { text: finnResponse };
            } else {
              return await agent!.respond('Pick an integer from 1 to 10. Just respond with the number, nothing else.');
            }
          })
        );

        // Send agent responses as they're processed
        const numbers = agents.map(({ name }, i) => {
          const num = parseInt(pickResponses[i].text.match(/\d+/)?.[0] || '0');

          const agentMsg = {
            agent: name,
            from: name,
            to: 'Orchestrator',
            message: `${num}`
          };
          sendUpdate({ type: 'message', message: agentMsg });

          allDebugEvents.push({
            type: 'AGENT_PICKED_NUMBER',
            data: { agent: name, number: num },
            timestamp: Date.now()
          });

          return num;
        });

        const correctSum = numbers.reduce((a, b) => a + b, 0);

        allDebugEvents.push({
          type: 'SUM_CALCULATED',
          data: { numbers, correctSum },
          timestamp: Date.now()
        });

        // Send only new debug events (messages already sent individually)
        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Step 2: Ask each agent who they want to reveal their number to (parallel)
        allDebugEvents.push({
          type: 'STEP_2_START',
          data: { message: 'Asking each agent who they want to reveal their number to' },
          timestamp: Date.now()
        });

        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Send orchestrator messages FIRST
        agents.forEach(({ name }, i) => {
          const otherAgents = agents.filter(a => a.name !== name).map(a => a.name);
          const orchestratorMsg = {
            agent: name,
            from: 'Orchestrator',
            to: name,
            message: `You picked ${numbers[i]}. Other agents: ${otherAgents.join(', ')}. Choose ONE to reveal to.`
          };
          sendUpdate({ type: 'message', message: orchestratorMsg });
        });

        // Get Finn's (human) response FIRST
        let finnRevealResponse: string = '';
        for (const { name, isHuman } of agents) {
          if (isHuman) {
            sendUpdate({ type: 'waiting_for_human', agent: name });
            finnRevealResponse = await waitForHumanResponse();
            break;
          }
        }

        // NOW get agent responses in parallel (LLMs only)
        const revealResponses = await Promise.all(
          agents.map(async ({ name, agent, isHuman }, i) => {
            if (isHuman) {
              return { text: finnRevealResponse, reasoning: '' };
            } else {
              // LLM agent
              const otherAgents = agents.filter(a => a.name !== name).map(a => a.name);
              return await agent!.respond(
                `You picked the number ${numbers[i]}. The other agents are: ${otherAgents.join(', ')}. ` +
                `Choose ONE agent to reveal your number to. Respond with just their name, nothing else.`,
                true // include reasoning
              );
            }
          })
        );

        // Send agent responses and parse reveals
        const reveals: { from: string; to: string; number: number }[] = [];
        agents.forEach(({ name }, i) => {
          const targetName = revealResponses[i].text.trim();

          const agentMsg = {
            agent: name,
            from: name,
            to: 'Orchestrator',
            message: `I choose to reveal to: ${targetName}`,
            reasoning: revealResponses[i].reasoning
          };
          sendUpdate({ type: 'message', message: agentMsg });

          allDebugEvents.push({
            type: 'REVEAL_CHOICE',
            data: { from: name, to: targetName, number: numbers[i], reasoning: revealResponses[i].reasoning },
            timestamp: Date.now()
          });

          reveals.push({ from: name, to: targetName, number: numbers[i] });
        });

        // Send only new debug events (messages already sent individually)
        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Step 3: Route the reveals to each agent and ask for sum
        allDebugEvents.push({
          type: 'STEP_3_START',
          data: { message: 'Routing reveals and asking for sum' },
          timestamp: Date.now()
        });

        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Send orchestrator messages FIRST
        agents.forEach(({ name }) => {
          const revealsToMe = reveals.filter(r => r.to === name);
          let revealMessage = revealsToMe.length > 0
            ? revealsToMe.map(r => `${r.from} revealed: ${r.number}`).join('. ')
            : 'No reveals received';

          const orchestratorMsg = {
            agent: name,
            from: 'Orchestrator',
            to: name,
            message: `${revealMessage}. What is the sum of all three numbers?`
          };
          sendUpdate({ type: 'message', message: orchestratorMsg });
        });

        // Get Finn's (human) response FIRST
        let finnFinalResponse: string = '';
        for (const { name, isHuman } of agents) {
          if (isHuman) {
            sendUpdate({ type: 'waiting_for_human', agent: name });
            finnFinalResponse = await waitForHumanResponse();
            break;
          }
        }

        // NOW get agent responses in parallel (LLMs only)
        const finalResponses = await Promise.all(
          agents.map(async ({ name, agent, isHuman }) => {
            if (isHuman) {
              return { text: finnFinalResponse, reasoning: '' };
            } else {
              // LLM agent
              // Find all reveals directed to this agent
              const revealsToMe = reveals.filter(r => r.to === name);

              let revealMessage = '';
              if (revealsToMe.length > 0) {
                const revealList = revealsToMe.map(r => `${r.from} revealed their number: ${r.number}`).join('. ');
                revealMessage = revealList + '. ';
              } else {
                revealMessage = 'No one revealed their number to you. ';
              }

              return await agent!.respond(
                `${revealMessage}What is the sum of all four agents' numbers?`,
                true // include reasoning
              );
            }
          })
        );

        // Send agent responses
        agents.forEach(({ name }, i) => {
          const guessNum = parseInt(finalResponses[i].text.match(/\d+/)?.[0] || '0');
          const isCorrect = guessNum === correctSum;

          const agentMsg = {
            agent: name,
            from: name,
            to: 'Orchestrator',
            message: `My guess: ${finalResponses[i].text}`,
            reasoning: finalResponses[i].reasoning
          };
          sendUpdate({ type: 'message', message: agentMsg });

          allDebugEvents.push({
            type: 'FINAL_GUESS',
            data: {
              agent: name,
              guess: guessNum,
              correct: isCorrect,
              correctSum,
              reasoning: finalResponses[i].reasoning
            },
            timestamp: Date.now()
          });
        });

        allDebugEvents.push({
          type: 'TEST_COMPLETE',
          data: { correctSum, message: 'Strategic sharing test complete' },
          timestamp: Date.now()
        });

        // Send only new debug events (messages already sent individually)
        newDebugEvents = allDebugEvents.slice(lastDebugCount);
        lastDebugCount = allDebugEvents.length;
        sendUpdate({ type: 'debug', debugEvents: newDebugEvents });

        // Send final complete message
        sendUpdate({ type: 'complete', correctSum });

        controller.close();
      } catch (error: any) {
        console.error('Error in strategic sharing test:', error);
        sendUpdate({ type: 'error', error: error.message || 'Failed to run test' });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
