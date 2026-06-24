# CNC Programmer Workflow & Data Lifecycle Guide

This document captures the complete workflow of a CNC programmer using the Tapeworm platform—from post-processing G-code in Autodesk Fusion/VS Code, through ingestion and revision control, to dynamic O-number rewriting and machine tool transmission.

---

## High-Level Workflow Diagram

```mermaid
graph TD
    subgraph 1. Fusion & VS Code (Editing)
        A[Autodesk Fusion CAM Setup] -->|Post Process| B[G-code Output: customer-part.cnc]
        B --> C[VS Code Editor / HSM Utility]
    end

    subgraph 2. Ingestion & Version Control (Database)
        C -->|Ingest & Parse| D[Tapeworm Library: Draft Status]
        D -->|Auto-Extract Metadata| E[O-number, Channels & Subprogram refs]
        F[Lead Reviewer / Dry Run] -->|Approve| G[Approved / In Production Status]
    end

    subgraph 3. Translation & Transmission (Wire)
        G -->|Arm Machine & Send| H[Dynamic O-number Resolver]
        H -->|Atomic Rewrite| I[Rewritten G-code Bundle]
        I -->|Dispatch| J{Transfer Mode}
        J -->|rs232_serial| K[Moxa NPort Socket ➔ Machine]
        J -->|net_share| L[Network Shared Folder]
        J -->|usb_gadget| M[Pi Zero Emulator]
    end

    subgraph 4. Loop Closure (Feedback)
        K & L & M -->|Operator Tweaks at Control Panel| N[Receive Program Back]
        N -->|Reverse Lookup via Substitution Map| O[Identify Part/Revision]
        O -->|Version Diff & Ingest| P[Record Operator Edits]
    end
```

---

## Detailed Step-by-Step Workflow

### Step 1: CAM Generation & Post-Processing (Autodesk Fusion)
1. **CAM Development**: The programmer designs the machining operations (mill setups, turning profiles, Swiss lathe channel synchronization) within Autodesk Fusion.
2. **Post-Processing**: The toolpath is compiled into G-code (machine-specific language) via a post-processor. 
   - Files are named using human-readable patterns:
     - **Swiss Lathes**: `customer-partnumber.cnc` (e.g. `grace-88602.cnc`). Since Swiss machines are monolithic, they contain all channels (`$1`, `$2`, `$0`) in a single file and do not require separate operation suffixes.
     - **Milling Centers**: `customer-part-op10.cnc`, `customer-part-op20.cnc`, etc., to distinguish between multiple setups on the same part.
3. **VS Code Inspection**: The programmer opens the posted G-code in VS Code (using the Autodesk HSM Post Processor Utility) to review tool numbers, speeds, feeds, and macro structures.

### Step 2: Library Ingestion (Tapeworm DB)
1. **File Ingestion**: The programmer uploads the `.cnc` file to Tapeworm (via the React Web Dashboard or the VS Code sidebar extension).
2. **Static G-code Parsing**: The Tapeworm ingest engine parses the text file:
   - Extracts the declared program number from the header (e.g. `O1001` or `:1001`).
   - Identifies Swiss lathe channels (delimiter lines starting with `$1`, `$2`, `$0`).
   - Resolves subprogram calls (`M98 Pxxxx` or `G65 Pxxxx`), logging them as dependencies in `program_dependencies` table to construct a dependency graph.
   - Ignores internal label calls (`M98 H100`) and highlights machine-resident macros (e.g. `P8000`).
3. **Status Control**: The file is stored in `program_revisions` as a `Draft` and cannot be transferred to the shop floor yet. Once dry runs or peer reviews are complete, a lead programmer toggles the status to `Approved` or `In Production`.

### Step 3: Dynamic O-Number Translation & Sending
CNCs have restricted memory namespaces (usually only four-digit numbers from `1` to `9999`). Programmers cannot organize files on the machine using names like `grace-88602-rev2.cnc`. Tapeworm resolves this mismatch dynamically at the moment of transmission:
1. **Select Target Machine**: The programmer selects the machine (e.g. Citizen L20 VIII #886) and hits "Send".
2. **Resolve Dependencies**: The resolver walks the dependency graph to find all subprograms referenced by the main file.
3. **Assign O-Numbers**: For each program in the bundle, Tapeworm looks up if it has a permanent `machine_program_assignments` record for this machine:
   - If an assignment exists, it reuses that `o_number`.
   - If no assignment exists, it automatically claims the first available O-number in the machine's namespace (preferring `1001-7999` to avoid system macros).
4. **Atomic Rewrite**: Tapeworm rewrites the G-code text in memory:
   - Swaps the root program header `Oxxxx` to `O[assigned]`.
   - Swaps all subprogram calls `M98 Pxxxx` / `G65 Pxxxx` to point to the children's assigned O-numbers.
5. **Wire Transmission**: The processed bundle is dispatched to the machine's configured port/path:
   - **RS-232**: Opened as a TCP socket connection to a port on a `Moxa NPort` server, streaming the G-code with hardware/software handshakes.
   - **Network Share**: Copied to a UNC directory monitored by the CNC controller.
   - **USB Gadget**: Secure-copied (SCP) to a Raspberry Pi Zero acting as a USB mass storage device plugged into the machine's USB port.

### Step 4: Loop Closure (Capturing Operator Edits)
Machine operators often make edits at the control panel to optimize spindle speed overrides, adjust feed rates, or correct tooling coordinates. In legacy shops, these edits are lost, leading to "proven" files in the library becoming out of sync with what ran on the floor.
1. **Receive Back**: When a job is complete, the operator (or an automated script) uploads the program back from the machine control.
2. **Reverse Lookup**: The program arrives named only as the O-number (e.g. `O3412`). Tapeworm queries the `transfers` table for the active substitution map on that machine.
3. **Diff Verification**: The system matches `O3412` back to `grace-88602.cnc`, diffs the returned text against the library file, and highlights the operator's panel edits.
4. **Commit to History**: The programmer reviews the changes, commits them to the program's history as a new revision, and updates the "proven" master file.
