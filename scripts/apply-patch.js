#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const patchFile = path.join(__dirname, '../patches/@assistant-ui+react+0.12.1.patch');
const targetFile = path.join(__dirname, '../node_modules/@assistant-ui/react/dist/legacy-runtime/runtime-cores/assistant-transport/useToolInvocations.js');

if (!fs.existsSync(targetFile)) {
  console.log('Target file not found, skipping patch application');
  process.exit(0);
}

// Read the current file
let content = fs.readFileSync(targetFile, 'utf8');

// Check if patch is already applied (look for the improved comment)
if (content.includes('// Check if new argsText is complete JSON (handles key reordering)')) {
  console.log('Patch already applied to @assistant-ui/react');
  process.exit(0);
}

// Apply the patch by replacing the old code with the new code
const oldCode = `if (!content.argsText.startsWith(lastState.argsText)) {
                                        // Check if this is key reordering (both are complete JSON)
                                        // This happens when transitioning from streaming to complete state
                                        // and the provider returns keys in a different order
                                        if (isArgsTextComplete(lastState.argsText) &&
                                            isArgsTextComplete(content.argsText)) {
                                            lastState.controller.argsText.close();
                                            lastToolStates.current[content.toolCallId] = {
                                                argsText: content.argsText,
                                                hasResult: lastState.hasResult,
                                                argsComplete: true,
                                                controller: lastState.controller,
                                            };
                                            return; // Continue to next content part
                                        }
                                        throw new Error(`;

const newCode = `if (!content.argsText.startsWith(lastState.argsText)) {
                                        // Check if new argsText is complete JSON (handles key reordering)
                                        // This happens when transitioning from streaming to complete state
                                        // and the provider returns keys in a different order
                                        if (isArgsTextComplete(content.argsText)) {
                                            try {
                                                const newArgs = JSON.parse(content.argsText);
                                                
                                                // If old is also complete, verify they're equivalent (just reordered)
                                                if (isArgsTextComplete(lastState.argsText)) {
                                                    const oldArgs = JSON.parse(lastState.argsText);
                                                    // Normalize both by sorting keys and compare
                                                    const oldNormalized = JSON.stringify(oldArgs, Object.keys(oldArgs).sort());
                                                    const newNormalized = JSON.stringify(newArgs, Object.keys(newArgs).sort());
                                                    
                                                    if (oldNormalized === newNormalized) {
                                                        // Same data, just reordered - accept it
                                                        lastState.controller.argsText.close();
                                                        lastToolStates.current[content.toolCallId] = {
                                                            argsText: content.argsText,
                                                            hasResult: lastState.hasResult,
                                                            argsComplete: true,
                                                            controller: lastState.controller,
                                                        };
                                                        return; // Continue to next content part
                                                    }
                                                } else {
                                                    // Old is incomplete, but new is complete
                                                    // Accept the new complete version (it's the final state)
                                                    lastState.controller.argsText.close();
                                                    lastToolStates.current[content.toolCallId] = {
                                                        argsText: content.argsText,
                                                        hasResult: lastState.hasResult,
                                                        argsComplete: true,
                                                        controller: lastState.controller,
                                                    };
                                                    return; // Continue to next content part
                                                }
                                            } catch (e) {
                                                // Not valid JSON, fall through to error
                                            }
                                        }
                                        throw new Error(`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('✅ Successfully applied patch to @assistant-ui/react');
} else {
  console.log('⚠️  Could not find the expected code to patch. The file may have been updated.');
  process.exit(1);
}
