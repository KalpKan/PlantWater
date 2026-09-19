import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyIcon from '@mui/icons-material/Key';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { getOpenAiKey, setOpenAiKey, clearOpenAiKey, looksLikeOpenAiKey, maskKey } from '../openaiKey';

/**
 * Optional "Use your own OpenAI key" field. The key never leaves the visitor's
 * browser except as a per-request header to this app's API, which forwards it to
 * OpenAI for that one call and forgets it. Kalp does not run an OpenAI key on
 * the hosted app (no paid keys in public demos), so this is the only way to get
 * OpenAI-written care guides; without it the built-in library answers.
 */
export default function OpenAiKeyField({ onChange }) {
  const [saved, setSaved] = useState(() => getOpenAiKey());
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState(null);

  const save = () => {
    const key = draft.trim();
    if (!looksLikeOpenAiKey(key)) {
      setMessage({ severity: 'warning', text: 'That does not look like an OpenAI API key (they start with "sk-"). Nothing was saved.' });
      return;
    }
    if (!setOpenAiKey(key)) {
      setMessage({ severity: 'error', text: 'This browser refused to store the key (private window or storage blocked). It will not be used.' });
      return;
    }
    setSaved(key);
    setDraft('');
    setShow(false);
    setMessage({ severity: 'success', text: `Key saved in this browser (ends in ${maskKey(key)}). It is sent with each identification and used for that request only.` });
    if (onChange) onChange(key);
  };

  const remove = () => {
    clearOpenAiKey();
    setSaved('');
    setDraft('');
    setMessage({ severity: 'info', text: 'Key removed from this browser. Care guides come from the built-in library again.' });
    if (onChange) onChange('');
  };

  return (
    <Accordion disableGutters sx={{ mb: 3, border: '1px solid #23272F', '&:before': { display: 'none' } }} data-testid="openai-key-section">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyIcon fontSize="small" color={saved ? 'primary' : 'disabled'} />
          <Typography variant="subtitle1">Use your own OpenAI key (optional)</Typography>
          {saved && <Typography variant="caption" color="text.secondary" data-testid="openai-key-status">saved, ends in {maskKey(saved)}</Typography>}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Without a key, care guides come from the built-in library (five common houseplants) or general houseplant
          advice. With your own key, OpenAI writes a species-specific guide on your account. The key stays in this
          browser only: it is sent with each identification request in a header, used for that one call, and never
          stored or logged on the server. Logging out removes it from this browser.
        </Typography>
        <TextField
          label="OpenAI API key"
          placeholder="sk-..."
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          fullWidth
          size="small"
          autoComplete="off"
          inputProps={{ 'data-testid': 'openai-key-input', spellCheck: 'false' }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton aria-label={show ? 'hide key' : 'show key'} onClick={() => setShow((v) => !v)} edge="end" size="small">
                  {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
          <Button variant="contained" size="small" onClick={save} disabled={!draft.trim()} data-testid="openai-key-save">
            {saved ? 'Replace key' : 'Save key in this browser'}
          </Button>
          {saved && (
            <Button variant="outlined" size="small" color="warning" onClick={remove} data-testid="openai-key-remove">
              Remove key
            </Button>
          )}
        </Box>
        {message && <Alert severity={message.severity} sx={{ mt: 2 }} data-testid="openai-key-message">{message.text}</Alert>}
      </AccordionDetails>
    </Accordion>
  );
}
