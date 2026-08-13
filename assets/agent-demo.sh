#!/usr/bin/env bash

# Staged terminal transcript for the README. The workflow and output mirror the
# antibody-scan skill; the short pauses make each decision readable in the GIF.

reset='\033[0m'
bold='\033[1m'
muted='\033[38;5;245m'
orange='\033[38;5;208m'
green='\033[38;5;114m'
red='\033[38;5;203m'
blue='\033[38;5;117m'

printf '\033[2J\033[H'
printf "${muted}ANTIBODY × CODING AGENT${reset}\n\n"
sleep 0.8

printf "${blue}${bold}you${reset}\n"
printf "Use Antibody to check my support agent before I merge.\n\n"
sleep 1.2

printf "${orange}${bold}agent${reset}\n"
printf "${muted}→ reading skills/antibody-scan/SKILL.md${reset}\n"
sleep 0.8
printf "${muted}→ running: npx antibody scan logs/latest.jsonl${reset}\n\n"
sleep 1.0

printf "${green}✓${reset} imported 12 new conversations\n"
printf "${red}✗${reset} ${bold}FM-003 · invents-dates-not-in-sources${reset}    1 hit\n\n"
sleep 1.3

printf "  ${muted}trace  tr-7c42b8a91e20 · assistant line 8${reset}\n"
printf "  ${red}\"Your refund will arrive Friday.\"${reset}\n"
printf "  ${muted}Tool result confirmed the refund—but provided no arrival date.${reset}\n\n"
sleep 1.8

printf "${orange}${bold}agent${reset}\n"
printf "Confirmed: this is the failure your team already flagged.\n"
printf "The response invented a date that was not in the source.\n\n"
sleep 1.2

printf "${red}${bold}MERGE STOPPED · exit 1${reset}\n"
printf "${muted}Antibody remembered the mistake. Your agent caught its return.${reset}\n"
sleep 2.5
