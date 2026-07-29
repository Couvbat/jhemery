import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactModule } from './contact/contact.module';
import { SteamModule } from './steam/steam.module';
import { GithubModule } from './github/github.module';
import { GuestbookModule } from './guestbook/guestbook.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContactModule,
    SteamModule,
    GithubModule,
    GuestbookModule,
  ],
})
export class AppModule {}
