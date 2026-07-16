import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/enums';
import { ChatService } from './chat.service';
import type { AuthUser } from '../auth/decorators';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('student')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Get active student/teacher chat history' })
  getStudentMessages(@CurrentUser() user: AuthUser) {
    return this.chatService.getStudentMessages(user.id, user.role);
  }

  @Post('student')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Send a chat message' })
  sendStudentMessage(@CurrentUser() user: AuthUser, @Body() body: { content: string }) {
    return this.chatService.sendStudentMessage(user.id, body.content, user.role);
  }

  // Admin-console only. TEACHER was removed: these routes return EVERY student's
  // and teacher's private thread with no ownership scoping, so a teacher could
  // read every other user's chat. Teachers use /chat/student for their own thread.
  @Get('admin/threads')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'List all active student chat threads' })
  getAdminThreads() {
    return this.chatService.getAdminThreads();
  }

  @Get('admin/threads/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Get chat messages for a specific student thread' })
  getAdminThreadMessages(@Param('studentId') studentId: string) {
    return this.chatService.getAdminThreadMessages(studentId);
  }

  @Post('admin/threads/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.ACADEMIC_COACH)
  @ApiOperation({ summary: 'Send a chat reply from admin to student' })
  sendAdminMessage(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Body() body: { content: string },
  ) {
    return this.chatService.sendAdminMessage(user.id, studentId, body.content);
  }
}
