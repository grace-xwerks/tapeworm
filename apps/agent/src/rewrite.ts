import type { ParsedProgram, SubprogramRef, MachineResidentRef, SubstitutionEntry } from '@tapeworm/shared';

/**
 * Parses G-code content to find the O-number header and any external subprogram references (M98 P____ / G65 P____).
 * It ignores internal sequence calls (M98 H____) and records machine-resident references.
 */
export function parseGCode(content: string): ParsedProgram {
  const lines = content.split(/\r?\n/);
  
  let o_number: number | null = null;
  const subprogram_refs: SubprogramRef[] = [];
  const machine_resident_refs: MachineResidentRef[] = [];
  const sync_labels: string[] = [];
  
  // Channels delimiter for Citizen Swiss lathes ($1, $2, $0)
  const channels: ParsedProgram['channels'] = [];
  
  // Track current channel parsing
  let currentChannel: { type: 'main_spindle' | 'sub_spindle' | 'parameters'; delimiter: string; startLine: number; contentLines: string[] } | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = idx + 1;
    
    // Parse Citizen channel indicators: $1 (main), $2 (sub), $0 (barfeed parameters)
    const channelMatch = line.match(/^(\$[0-2])\b/);
    if (channelMatch) {
      const delimiter = channelMatch[1];
      const type = delimiter === '$1' ? 'main_spindle' : delimiter === '$2' ? 'sub_spindle' : 'parameters';
      
      if (currentChannel) {
        // Close previous channel
        channels.push({
          type: currentChannel.type,
          delimiter: currentChannel.delimiter,
          content: currentChannel.contentLines.join('\n'),
          line_start: currentChannel.startLine,
          line_end: lineNum - 1
        });
      }
      
      currentChannel = {
        type,
        delimiter,
        startLine: lineNum,
        contentLines: []
      };
      continue;
    }
    
    if (currentChannel) {
      currentChannel.contentLines.push(line);
    }

    // Strip comments to avoid parsing subprogram calls in comments
    // Comments in G-code are usually in parentheses (comment) or after a semicolon ; comment
    const cleanLine = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '');

    // 1. Program number declaration: O1234 or :1234
    // Usually at the start of the file or start of a channel
    if (o_number === null) {
      const headerMatch = cleanLine.match(/^[O:]\s*(\d{1,4})\b/i);
      if (headerMatch) {
        o_number = parseInt(headerMatch[1], 10);
      }
    }

    // 2. Subprogram calls: M98 Pxxxx, G65 Pxxxx
    // Match optional block delete slash /
    const isOptional = cleanLine.trim().startsWith('/');
    
    // Find all M98/G65 P calls on this line
    const callRegex = /\b(M98|G65)\s*P\s*(\d{1,4})\b/ig;
    let match;
    while ((match = callRegex.exec(cleanLine)) !== null) {
      const call_type = match[1].toUpperCase() as 'M98P' | 'G65P';
      const ref_number = parseInt(match[2], 10);
      
      // Citizen machine-resident subprograms (usually 8000-8999 or 9000+)
      if (ref_number >= 8000) {
        machine_resident_refs.push({
          ref_number,
          reason: `O-number ${ref_number} is flagged as machine-resident (>= 8000)`
        });
      } else {
        subprogram_refs.push({
          call_type,
          ref_number,
          line_number: lineNum,
          is_optional: isOptional
        });
      }
    }
    
    // Citizen Sync labels !L123
    const syncMatch = cleanLine.match(/!L\s*(\d+)/i);
    if (syncMatch) {
      sync_labels.push(syncMatch[1]);
    }
  }

  // Close final channel if active
  if (currentChannel) {
    channels.push({
      type: currentChannel.type,
      delimiter: currentChannel.delimiter,
      content: currentChannel.contentLines.join('\n'),
      line_start: currentChannel.startLine,
      line_end: lines.length
    });
  }

  return {
    o_number,
    channels,
    subprogram_refs,
    machine_resident_refs,
    sync_labels
  };
}

/**
 * Rewrites program headers and subprogram calls in the G-code content according to the substitution map.
 */
export function rewriteGCode(content: string, substitutions: SubstitutionEntry[]): string {
  if (substitutions.length === 0) return content;

  // Map original O-numbers to their assigned ones
  const subMap = new Map<number, number>();
  for (const sub of substitutions) {
    subMap.set(sub.original_o_number, sub.assigned_o_number);
  }

  const lines = content.split(/\r?\n/);
  const rewrittenLines = lines.map((line, idx) => {
    // Keep comments separate to avoid editing inside them
    let cleanLine = line;
    let commentPart = '';
    
    // Simple inline comment search
    const semiIdx = line.indexOf(';');
    const parenStartIdx = line.indexOf('(');
    
    if (semiIdx !== -1) {
      cleanLine = line.substring(0, semiIdx);
      commentPart = line.substring(semiIdx);
    } else if (parenStartIdx !== -1) {
      const parenEndIdx = line.lastIndexOf(')');
      if (parenEndIdx !== -1 && parenEndIdx > parenStartIdx) {
        // If the line ends with a comment or has a paren comment at the end
        cleanLine = line.substring(0, parenStartIdx);
        commentPart = line.substring(parenStartIdx);
      }
    }

    // 1. Rewrite program header: O1234 -> O5678 or :1234 -> :5678
    const headerMatch = cleanLine.match(/^([O:]\s*)(\d{1,4})\b/i);
    if (headerMatch) {
      const prefix = headerMatch[1];
      const origNum = parseInt(headerMatch[2], 10);
      const newNum = subMap.get(origNum);
      if (newNum !== undefined) {
        cleanLine = cleanLine.replace(headerMatch[0], `${prefix}${newNum}`);
      }
    }

    // 2. Rewrite calls: M98 P1234 -> M98 P5678 or G65 P1234 -> G65 P5678
    cleanLine = cleanLine.replace(/\b(M98|G65)(\s*P\s*)(\d{1,4})\b/ig, (match, cmd, spacing, origNumStr) => {
      const origNum = parseInt(origNumStr, 10);
      const newNum = subMap.get(origNum);
      if (newNum !== undefined) {
        return `${cmd}${spacing}${newNum}`;
      }
      return match;
    });

    return cleanLine + commentPart;
  });

  return rewrittenLines.join('\r\n'); // Output using standard carriage-return line endings for CNCs
}
