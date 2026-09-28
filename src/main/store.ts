import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Project, ProjectDetail, Transcript } from '@shared/types'
import { paths } from './paths'

const projectFile = (id: string) => join(paths.project(id), 'project.json')
const transcriptFile = (id: string) => join(paths.project(id), 'transcript.json')
export const thumbnailFile = (id: string) => join(paths.project(id), 'thumbnail.jpg')

export function listProjects(): Project[] {
  const dir = paths.projects()
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'project.json')))
    .map((d) => readProject(d.name))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function readProject(id: string): Project | null {
  try {
    return JSON.parse(readFileSync(projectFile(id), 'utf8')) as Project
  } catch {
    return null
  }
}

export function writeProject(project: Project): Project {
  project.updatedAt = new Date().toISOString()
  writeFileSync(projectFile(project.id), JSON.stringify(project, null, 2))
  return project
}

export function updateProject(id: string, patch: Partial<Project>): Project {
  const current = readProject(id)
  if (!current) throw new Error('That project no longer exists.')
  return writeProject({ ...current, ...patch, id })
}

export function readTranscript(id: string): Transcript | null {
  const file = transcriptFile(id)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Transcript
}

export function writeTranscript(id: string, transcript: Transcript): void {
  writeFileSync(transcriptFile(id), JSON.stringify(transcript))
}

export function getProjectDetail(id: string): ProjectDetail {
  const project = readProject(id)
  if (!project) throw new Error('That project no longer exists.')
  return { project, transcript: readTranscript(id) }
}

export function deleteProject(id: string): void {
  rmSync(paths.project(id), { recursive: true, force: true })
}
