import type { Project, Skill } from '../types/project'
import type { WorkspaceMembershipRole } from '../types/user'

export function canManageSkills(role?: WorkspaceMembershipRole | null): boolean {
  return role === 'owner' || role === 'editor'
}

export function canToggleProjectSkills(role?: WorkspaceMembershipRole | null): boolean {
  return canManageSkills(role)
}

export function syncSkillNameAcrossProjects(
  projects: Project[],
  skillId: string,
  name: string,
): Project[] {
  return projects.map((project) => {
    if (!project.contextRules?.skills?.length) return project

    return {
      ...project,
      contextRules: {
        ...project.contextRules,
        skills: project.contextRules.skills.map((skill) =>
          skill.id === skillId ? { ...skill, name } : skill
        ),
      },
    }
  })
}

export function removeSkillFromProjects(projects: Project[], skillId: string): Project[] {
  return projects.map((project) => {
    if (!project.contextRules?.skills) return project

    return {
      ...project,
      contextRules: {
        ...project.contextRules,
        skills: project.contextRules.skills.filter((skill) => skill.id !== skillId),
      },
    }
  })
}

export function upsertProjectSkillState(
  skills: Skill[],
  skill: Pick<Skill, 'id' | 'name'>,
  active: boolean,
): Skill[] {
  const existing = skills.find((entry) => entry.id === skill.id)
  if (existing) {
    return skills.map((entry) =>
      entry.id === skill.id ? { ...entry, name: skill.name, active } : entry
    )
  }

  if (!active) return skills
  return [...skills, { id: skill.id, name: skill.name, active }]
}
